# SQLite + sqlite-vss 重构计划

> 基于代码审查反馈的详细实施计划

## 一、当前架构分析

### 1.1 现有组件关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI / MCP Server                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DIContainer (bootstrap.ts)                   │
├─────────────────────────────────────────────────────────────────┤
│  Services:                                                      │
│  ├── LearningService → 分析代码库 → 存储概念/模式/向量             │
│  ├── SearchService  → 语义搜索 → 组合向量结果+业务数据             │
│  ├── AnalysisService → 代码分析                                  │
│  └── DiagnosticService → 诊断                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Storage Layer                                                  │
│  ├── SQLiteDatabase → semantic_concepts, developer_patterns,    │
│  │                   project_metadata                           │
│  └── VectorStore → 3 backends: null, sqlite-cosine, sqlite-vec  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 当前问题识别

| 问题 | 严重性 | 位置 | 描述 |
|------|--------|------|------|
| metadata 混合存储 | 🔴 高 | vector-store.ts:200-204 | `vector_payloads` 表存储业务数据 |
| 无两阶段查询 | 🔴 高 | SearchService.ts:56-89 | 搜索结果直接返回，未进行业务过滤 |
| 无 embedding 版本控制 | 🟡 中 | 全局 | 模型变更后索引无法自动重建 |
| 无原子化删除 | 🔴 高 | LearningService.ts | 删除时向量可能残留 |
| 无单写者锁 | 🟡 中 | 全局 | 并发写入可能导致数据损坏 |
| 无索引重建命令 | 🟡 中 | CLI | 无法重建向量索引 |

---

## 二、目标架构设计

### 2.1 数据模型分离

```
┌─────────────────────────────────────────────────────────────────┐
│                    System of Record (SoR)                        │
│  SQLite Database (in-memoria.db)                                │
├─────────────────────────────────────────────────────────────────┤
│  业务表 (可迁移、可读):                                          │
│  ├── semantic_concepts (概念)                                   │
│  ├── developer_patterns (模式)                                  │
│  ├── project_metadata (项目元数据)                              │
│  └── embedding_configs (embedding 版本控制) ← 新增              │
└─────────────────────────────────────────────────────────────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                              ▼
┌─────────────────────────┐    ┌──────────────────────────────────┐
│  Vector Index (派生)     │    │  Files Cache (可选)              │
│  in-memoria-vectors.db  │    │  原始文件内容缓存                 │
├─────────────────────────┤    ├──────────────────────────────────┤
│  chunk_vectors          │    │  file_contents                   │
│  └── rowid, chunk_id    │    │  └── path, content, hash         │
│  chunk_vectors_vss      │    └──────────────────────────────────┘
│  └── rowid, embedding   │
└─────────────────────────┘
```

### 2.2 Repository 层分离

```
┌─────────────────────────────────────────────────────────────────┐
│                      Repository Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  ChunkRepository (新增)                                          │
│  ├── findByIds(ids) → chunks[]                                  │
│  ├── upsert(chunks)                                             │
│  └── deleteByFile(filePath)                                     │
├─────────────────────────────────────────────────────────────────┤
│  ConceptRepository (重构自现有逻辑)                              │
│  ├── findAll()                                                  │
│  └── upsert(concepts)                                           │
├─────────────────────────────────────────────────────────────────┤
│  PatternRepository (重构自现有逻辑)                              │
│  ├── findAll()                                                  │
│  └── upsert(patterns)                                           │
├─────────────────────────────────────────────────────────────────┤
│  EmbeddingConfigRepository (新增)                                │
│  ├── getCurrent()                                               │
│  └── upsert(config)                                             │
├─────────────────────────────────────────────────────────────────┤
│  VectorIndexRepository (新增)                                    │
│  ├── upsert(embeddings)                                         │
│  ├── search(vector, limit) → ids[]                              │
│  ├── deleteByIds(ids)                                           │
│  └── rebuild()                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、实施步骤详解

### 阶段 1: 数据模型重构 (Foundation)

#### 3.1.1 更新 schema.sql

```sql
-- 新增 embedding_configs 表用于版本控制
CREATE TABLE IF NOT EXISTS embedding_configs (
    id TEXT PRIMARY KEY DEFAULT 'current',
    model TEXT NOT NULL,
    dimension INTEGER NOT NULL,
    normalize BOOLEAN DEFAULT TRUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- chunks 表（用于两阶段查询）
CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_type TEXT NOT NULL,
    embedding_config_id TEXT DEFAULT 'current',
    line_start INTEGER DEFAULT 0,
    line_end INTEGER DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 向量索引表（仅存储 embedding）
CREATE TABLE IF NOT EXISTS chunk_vectors (
    chunk_id TEXT PRIMARY KEY,
    embedding BLOB NOT NULL
);

-- sqlite-vss 虚拟表
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors_vss
USING vss0(embedding(384));

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks(chunk_type);
```

#### 3.1.2 更新 sqlite-db.ts

- 添加 `EmbeddingConfig` 接口
- 添加 `Chunk` 接口
- 添加 `EmbeddingConfigRepository` 方法
- 添加 `ChunkRepository` 方法
- 添加 `VectorIndexRepository` 方法（仅操作向量表）

#### 3.1.3 创建 repository 层

新建文件：
- `src/storage/repositories/chunk-repository.ts`
- `src/storage/repositories/embedding-config-repository.ts`
- `src/storage/repositories/vector-index-repository.ts`

---

### 阶段 2: VectorStore 重构

#### 3.2.1 新的 VectorStore 接口

```typescript
// src/storage/vector-store.ts

export interface VectorStore {
    // 向量操作（仅 embedding）
    upsertVectors(items: VectorItem[]): Promise<void>;
    searchVectors(vector: number[], limit: number): Promise<string[]>; // 返回 chunk_ids
    deleteByIds(ids: string[]): Promise<void>;
    clear(): Promise<void>;
    
    // 索引状态
    isEnabled(): boolean;
    getVectorCount(): number;
    needsRebuild(): boolean; // 检查 embedding 版本是否变化
}

export interface VectorItem {
    id: string;        // chunk_id
    vector: number[];  // embedding 向量
}
```

#### 3.2.2 SQLiteVecVectorStore 实现要点

```typescript
class SQLiteVecVectorStore implements VectorStore {
    async upsertVectors(items: VectorItem[]): Promise<void> {
        const tx = this.db.transaction(() => {
            for (const item of items) {
                // 1. 插入/更新 chunk_vectors
                this.db.prepare(`
                    INSERT OR REPLACE INTO chunk_vectors (chunk_id, embedding)
                    VALUES (?, ?)
                `).run(item.id, Buffer.from(new Float32Array(item.vector).buffer));
                
                // 2. 插入 vss 表（通过 rowid 关联）
                const rowid = this.db.prepare(`
                    SELECT rowid FROM chunk_vectors WHERE chunk_id = ?
                `).get(item.id).rowid;
                
                this.db.prepare(`
                    INSERT OR REPLACE INTO chunk_vectors_vss (rowid, embedding)
                    VALUES (?, ?)
                `).run(rowid, Buffer.from(new Float32Array(item.vector).buffer));
            }
        });
        tx();
    }
    
    async searchVectors(vector: number[], limit: number): Promise<string[]> {
        const buffer = Buffer.from(new Float32Array(vector).buffer);
        const rows = this.db.prepare(`
            SELECT cv.chunk_id, vss.distance
            FROM chunk_vectors_vss vss
            JOIN chunk_vectors cv ON cv.rowid = vss.rowid
            WHERE vss.vector MATCH topk_cosine(?, ?)
            ORDER BY vss.distance
            LIMIT ?
        `).all(buffer, limit, limit);
        
        return rows.map(row => row.chunk_id);
    }
}
```

---

### 阶段 3: Service 层更新

#### 3.3.1 SearchService 两阶段查询

```typescript
class SearchServiceImpl implements SearchService {
    async searchSemantic(query: string, options: SearchOptions = {}): Promise<SemanticSearchResult[]> {
        // Step 1: 向量搜索 → 获取 chunk_ids
        const vector = await this.embeddingEngine.embed(query);
        const chunkIds = await this.vectorStore.searchVectors(vector, options.limit ?? 20);
        
        // Step 2: 业务过滤 + 排序
        const chunks = await this.chunkRepository.findByIds(chunkIds);
        
        // 业务过滤（如果需要）
        let filtered = chunks;
        if (options.language) {
            filtered = chunks.filter(c => c.filePath.endsWith(`.${options.language}`));
        }
        
        // 按向量距离排序（需要返回距离）
        return filtered.map(chunk => ({
            file: chunk.filePath,
            content: chunk.content,
            score: 1.0, // 需要改进：存储距离
            // ...
        }));
    }
}
```

#### 3.3.2 LearningService 原子化写入

```typescript
class LearningServiceImpl implements LearningService {
    async learnFromCodebase(projectPath: string, options: LearningOptions = {}): Promise<LearningResult> {
        // 验证 embedding 版本
        const currentConfig = await this.embeddingConfigRepo.getCurrent();
        const newConfig = {
            model: config.getEmbeddingModel(),
            dimension: config.getEmbeddingDimension(),
        };
        
        const needsRebuild = !currentConfig || 
            currentConfig.model !== newConfig.model ||
            currentConfig.dimension !== newConfig.dimension;
        
        // 如果需要重建，先清空向量索引
        if (needsRebuild && !options.force) {
            await this.vectorIndexRepo.clear();
            await this.embeddingConfigRepo.upsert(newConfig);
        }
        
        // 事务性写入：概念 + 模式 + 向量
        const tx = this.db.transaction(() => {
            // 1. 存储概念
            this.conceptRepository.upsert(concepts);
            
            // 2. 存储模式
            this.patternRepository.upsert(patterns);
            
            // 3. 生成向量并索引
            if (needsRebuild || options.force) {
                const vectorItems = concepts.map(c => ({
                    id: c.id,
                    vector: await this.embeddingEngine.embed(`${c.type}: ${c.name}`),
                }));
                this.vectorIndexRepo.upsertVectors(vectorItems);
            }
        });
        
        tx();
    }
}
```

---

### 阶段 4: 并发控制

#### 3.4.1 单写者锁机制

```typescript
// src/utils/write-lock.ts

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

export class WriteLockManager {
    private lockDb: Database.Database;
    private projectPath: string;
    
    constructor(projectPath: string) {
        this.projectPath = projectPath;
        const lockDbPath = join(dirname(projectPath), ".in-memoria", "write-lock.db");
        const lockDir = dirname(lockDbPath);
        
        if (!existsSync(lockDir)) {
            mkdirSync(lockDir, { recursive: true });
        }
        
        this.lockDb = new Database(lockDbPath);
        this.lockDb.pragma("journal_mode = WAL");
        this.lockDb.exec(`
            CREATE TABLE IF NOT EXISTS write_locks (
                id TEXT PRIMARY KEY DEFAULT 'global',
                locked_at TEXT DEFAULT CURRENT_TIMESTAMP,
                pid INTEGER NOT NULL
            );
        `);
    }
    
    acquire(): boolean {
        try {
            // 使用 IMMEDIATE 事务获取排他锁
            const tx = this.lockDb.transaction(() => {
                const existing = this.lockDb.prepare("SELECT * FROM write_locks WHERE id = 'global'").get();
                if (existing && existing.pid !== process.pid) {
                    // 已被其他进程锁定
                    throw new Error("Write lock held by another process");
                }
                this.lockDb.prepare(`
                    INSERT OR REPLACE INTO write_locks (id, locked_at, pid)
                    VALUES ('global', CURRENT_TIMESTAMP, ?)
                `).run(process.pid);
            });
            tx();
            return true;
        } catch (error) {
            console.warn("Failed to acquire write lock:", error);
            return false;
        }
    }
    
    release(): void {
        this.lockDb.prepare("DELETE FROM write_locks WHERE id = 'global'").run();
    }
    
    isLocked(): boolean {
        const lock = this.lockDb.prepare("SELECT * FROM write_locks WHERE id = 'global'").get() as any;
        return lock !== undefined && lock.pid !== process.pid;
    }
}
```

#### 3.4.2 在 LearningService 中使用

```typescript
class LearningServiceImpl implements LearningService {
    constructor(
        // ...
        private writeLock: WriteLockManager,
    ) {}
    
    async learnFromCodebase(projectPath: string, options: LearningOptions = {}): Promise<LearningResult> {
        // 尝试获取写锁
        if (!this.writeLock.acquire()) {
            return {
                success: false,
                errors: ["Another learning process is running. Please wait and retry."],
                // ...
            };
        }
        
        try {
            // ... 正常处理
        } finally {
            this.writeLock.release();
        }
    }
}
```

---

### 阶段 5: CLI 命令

#### 3.5.1 索引重建命令

```typescript
// src/cli/rebuild-index.ts

export interface RebuildIndexArgs {
    path: string;
    force: boolean;
    verbose: boolean;
}

export async function handleRebuildIndexCommand(args: RebuildIndexArgs): Promise<void> {
    const container = await initializeDIContainer({ projectPath: args.path });
    
    console.log("🔧 Starting vector index rebuild...");
    
    // 检查是否需要强制重建
    const needsRebuild = await container.vectorIndexRepo.needsRebuild();
    if (!needsRebuild && !args.force) {
        console.log("✅ Index is up to date. Use --force to rebuild anyway.");
        return;
    }
    
    // 重建索引
    await container.vectorIndexRepo.rebuild();
    
    console.log("✅ Vector index rebuilt successfully.");
}
```

---

## 四、风险评估与缓解

### 4.1 高风险项

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 数据迁移丢失 | 中 | 高 | 先备份数据库，提供回滚脚本 |
| 向量索引损坏 | 低 | 高 | 事务保护，自动检测损坏 |
| 并发写入冲突 | 中 | 中 | 单写者锁机制 |
| 向量维度不匹配 | 低 | 高 | Embedding 版本控制 |

### 4.2 回滚计划

1. **备份策略**: 每次迁移前自动备份 `.db` 文件
2. **渐进式迁移**: 新旧 schema 共存，逐步迁移
3. **快速回滚**: 提供 `npm run rollback` 命令

---

## 五、测试策略

### 5.1 单元测试

```typescript
// src/__tests__/vector-store.test.ts

describe("VectorStore", () => {
    describe("upsertVectors", () => {
        it("should insert vectors into both chunk_vectors and vss tables", async () => {
            // 验证数据写入
        });
        
        it("should handle duplicate ids with upsert", async () => {
            // 验证更新逻辑
        });
    });
    
    describe("searchVectors", () => {
        it("should return chunk_ids in order of similarity", async () => {
            // 验证搜索排序
        });
    });
});
```

### 5.2 集成测试

```typescript
// tests/integration/sqlite-vss.test.ts

describe("SQLite + sqlite-vss Integration", () => {
    it("should perform two-phase search correctly", async () => {
        // 1. 创建测试数据
        // 2. 执行搜索
        // 3. 验证结果正确性
    });
    
    it("should handle atomic deletes", async () => {
        // 1. 创建数据
        // 2. 删除
        // 3. 验证向量和业务数据同时删除
    });
});
```

---

## 六、验证标准

### 6.1 功能验证

- [ ] 向量搜索返回正确结果（Top-K 相似度）
- [ ] 两阶段查询正常工作
- [ ] 删除操作原子化（无残留向量）
- [ ] Embedding 版本变化时触发重建
- [ ] 并发写入被正确阻止

### 6.2 性能验证

- [ ] 搜索响应时间 < 500ms（1000 条记录）
- [ ] 批量插入性能可接受（1000 条/秒）
- [ ] 内存使用稳定

### 6.3 兼容性验证

- [ ] 向后兼容现有数据库
- [ ] CLI 命令正常工作
- [ ] MCP 工具返回正确结果

---

## 七、文件变更清单

### 新增文件

| 文件 | 描述 |
|------|------|
| `src/storage/repositories/chunk-repository.ts` | Chunk 数据访问 |
| `src/storage/repositories/embedding-config-repository.ts` | Embedding 配置管理 |
| `src/storage/repositories/vector-index-repository.ts` | 向量索引操作 |
| `src/utils/write-lock.ts` | 单写者锁 |
| `src/cli/rebuild-index.ts` | 索引重建命令 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/storage/schema.sql` | 新增表和索引 |
| `src/storage/sqlite-db.ts` | 新增 Repository 方法 |
| `src/storage/vector-store.ts` | 重构 VectorStore 接口 |
| `src/core/services/SearchService.ts` | 两阶段查询 |
| `src/core/services/LearningService.ts` | 原子化写入 |
| `src/core/bootstrap.ts` | 注册新服务 |
| `src/core/container/service-keys.ts` | 新增服务键 |

---

## 八、执行顺序

```
Phase 1: 数据模型
  ├── 1.1 更新 schema.sql
  ├── 1.2 更新 sqlite-db.ts
  └── 1.3 创建 Repository 层

Phase 2: VectorStore
  ├── 2.1 重构 VectorStore 接口
  └── 2.2 实现 sqlite-vss backend

Phase 3: Service 层
  ├── 3.1 更新 SearchService
  └── 3.2 更新 LearningService

Phase 4: 并发控制
  ├── 4.1 实现 WriteLockManager
  └── 4.2 集成到 LearningService

Phase 5: CLI 命令
  ├── 5.1 创建 rebuild-index 命令
  └── 5.2 更新 package.json scripts

Phase 6: 测试
  ├── 6.1 单元测试
  └── 6.2 集成测试

Phase 7: 文档
  └── 7.1 更新 README 和配置示例
```

---

## 九、时间线预估

> **注意**: 以下为任务数量估算，不包含具体时间

- Phase 1: 3-4 个任务
- Phase 2: 2-3 个任务
- Phase 3: 2 个任务
- Phase 4: 2 个任务
- Phase 5: 2 个任务
- Phase 6: 2-3 个任务
- Phase 7: 1 个任务

**总计**: 约 14-18 个独立任务

---

## 十、注意事项

1. **不要将 metadata 存入 vss 表** - 违反 sqlite-vss 设计原则
2. **不要依赖 vss 做过滤** - 使用两阶段查询
3. **不要并发写 vss 表** - 使用单写者锁
4. **始终使用事务** - 保证数据一致性
5. **保持向后兼容** - 现有数据可迁移