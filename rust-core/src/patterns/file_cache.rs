//! File cache for efficient pattern discovery
//!
//! This module provides a shared cache that reads files once and shares
//! the contents across all pattern analyzers, eliminating redundant I/O.

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

/// Represents a cached file with its metadata
#[derive(Debug, Clone)]
pub struct CachedFile {
    pub path: String,
    pub content: String,
    pub extension: String,
    pub size: usize,
}

/// Configuration for file cache
#[derive(Debug, Clone)]
pub struct FileCacheConfig {
    pub max_depth: usize,
    pub max_files: usize,
    pub max_file_size: u64,
    pub include_extensions: Vec<String>,
    pub excluded_dirs: Vec<String>,
}

impl Default for FileCacheConfig {
    fn default() -> Self {
        FileCacheConfig {
            max_depth: 5,
            max_files: 500,
            max_file_size: 1_000_000, // 1MB
            include_extensions: vec![
                "ts".to_string(),
                "tsx".to_string(),
                "js".to_string(),
                "jsx".to_string(),
                "rs".to_string(),
                "py".to_string(),
                "java".to_string(),
                "cs".to_string(),
                "cpp".to_string(),
                "c".to_string(),
                "go".to_string(),
                "rb".to_string(),
                "php".to_string(),
            ],
            excluded_dirs: vec![
                "node_modules".to_string(),
                ".git".to_string(),
                "target".to_string(),
                "dist".to_string(),
                "build".to_string(),
                ".next".to_string(),
                "__pycache__".to_string(),
                "coverage".to_string(),
                ".vscode".to_string(),
                ".idea".to_string(),
                "vendor".to_string(),
                "deps".to_string(),
            ],
        }
    }
}

/// File cache that reads files once and shares across analyzers
pub struct FileCache {
    files: HashMap<String, CachedFile>,
    config: FileCacheConfig,
    total_bytes_cached: usize,
}

impl FileCache {
    /// Create a new file cache with default configuration
    pub fn new() -> Self {
        Self::with_config(FileCacheConfig::default())
    }

    /// Create a new file cache with custom configuration
    pub fn with_config(config: FileCacheConfig) -> Self {
        FileCache {
            files: HashMap::new(),
            config,
            total_bytes_cached: 0,
        }
    }

    /// Load files from a directory into the cache
    pub fn load_from_directory(&mut self, path: &str) -> Result<usize, std::io::Error> {
        let mut files_loaded = 0;
        let start_time = std::time::Instant::now();

        // Collect entries first to avoid borrow checker issues
        let entries: Vec<_> = WalkDir::new(path)
            .max_depth(self.config.max_depth)
            .into_iter()
            .filter_entry(|e| {
                // Clone config data to avoid borrowing issues
                let excluded_dirs = &self.config.excluded_dirs;
                if !e.file_type().is_dir() {
                    return true;
                }
                if let Some(dir_name) = e.file_name().to_str() {
                    !excluded_dirs.iter().any(|excluded| dir_name == excluded)
                } else {
                    true
                }
            })
            .filter_map(|e| e.ok())
            .collect();

        for entry in entries {
            // Check limits
            if files_loaded >= self.config.max_files {
                break;
            }

            if entry.file_type().is_file() {
                if let Some(cached_file) = self.try_cache_file(entry.path())? {
                    self.files.insert(cached_file.path.clone(), cached_file);
                    files_loaded += 1;
                }
            }
        }

        let duration = start_time.elapsed();
        eprintln!(
            "FileCache: Loaded {} files ({} bytes) in {:.2}s",
            files_loaded,
            self.total_bytes_cached,
            duration.as_secs_f64()
        );

        Ok(files_loaded)
    }

    /// Try to cache a single file
    fn try_cache_file(&mut self, file_path: &Path) -> Result<Option<CachedFile>, std::io::Error> {
        // Check file extension
        let extension = match file_path.extension().and_then(|s| s.to_str()) {
            Some(ext) => ext.to_lowercase(),
            None => return Ok(None),
        };

        if !self.config.include_extensions.contains(&extension) {
            return Ok(None);
        }

        // Check file size
        let metadata = fs::metadata(file_path)?;
        if metadata.len() > self.config.max_file_size {
            return Ok(None);
        }

        // Read file content
        match fs::read_to_string(file_path) {
            Ok(content) => {
                let size = content.len();
                self.total_bytes_cached += size;

                Ok(Some(CachedFile {
                    path: file_path.to_string_lossy().to_string(),
                    content,
                    extension,
                    size,
                }))
            }
            Err(_) => Ok(None), // Skip files that can't be read as UTF-8
        }
    }

    /// Get a cached file by path
    pub fn get(&self, path: &str) -> Option<&CachedFile> {
        self.files.get(path)
    }

    /// Get all cached files
    pub fn get_all(&self) -> Vec<&CachedFile> {
        self.files.values().collect()
    }

    /// Get cached files filtered by extension
    pub fn get_by_extension(&self, extension: &str) -> Vec<&CachedFile> {
        self.files
            .values()
            .filter(|f| f.extension == extension)
            .collect()
    }

    /// Get cached files filtered by predicate
    pub fn get_filtered<F>(&self, predicate: F) -> Vec<&CachedFile>
    where
        F: Fn(&CachedFile) -> bool,
    {
        self.files.values().filter(|f| predicate(f)).collect()
    }

    /// Get the number of cached files
    pub fn len(&self) -> usize {
        self.files.len()
    }

    /// Check if cache is empty
    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }

    /// Get total bytes cached
    pub fn total_bytes(&self) -> usize {
        self.total_bytes_cached
    }

    /// Clear the cache
    pub fn clear(&mut self) {
        self.files.clear();
        self.total_bytes_cached = 0;
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        let mut extension_counts: HashMap<String, usize> = HashMap::new();
        for file in self.files.values() {
            *extension_counts.entry(file.extension.clone()).or_insert(0) += 1;
        }

        CacheStats {
            total_files: self.files.len(),
            total_bytes: self.total_bytes_cached,
            extension_counts,
        }
    }
}

impl Default for FileCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Statistics about the file cache
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub total_files: usize,
    pub total_bytes: usize,
    pub extension_counts: HashMap<String, usize>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_file_cache_creation() {
        let cache = FileCache::new();
        assert_eq!(cache.len(), 0);
        assert!(cache.is_empty());
    }

    #[test]
    fn test_file_cache_config() {
        let config = FileCacheConfig {
            max_depth: 3,
            max_files: 100,
            max_file_size: 500_000,
            include_extensions: vec!["rs".to_string()],
            excluded_dirs: vec!["target".to_string()],
        };

        let cache = FileCache::with_config(config.clone());
        assert_eq!(cache.config.max_depth, 3);
        assert_eq!(cache.config.max_files, 100);
    }

    #[test]
    fn test_load_from_directory() {
        let temp_dir = TempDir::new().unwrap();
        let base_path = temp_dir.path();

        // Create test files
        fs::write(base_path.join("test1.rs"), "fn main() {}").unwrap();
        fs::write(base_path.join("test2.ts"), "console.log('hello')").unwrap();
        fs::write(base_path.join("README.md"), "# Test").unwrap(); // Should be excluded

        let mut cache = FileCache::new();
        let files_loaded = cache
            .load_from_directory(base_path.to_str().unwrap())
            .unwrap();

        assert_eq!(files_loaded, 2); // Only .rs and .ts files
        assert_eq!(cache.len(), 2);
    }

    #[test]
    fn test_excluded_directories() {
        let temp_dir = TempDir::new().unwrap();
        let base_path = temp_dir.path();

        // Create excluded directory
        let node_modules = base_path.join("node_modules");
        fs::create_dir(&node_modules).unwrap();
        fs::write(node_modules.join("package.js"), "module.exports = {}").unwrap();

        // Create included file
        fs::write(base_path.join("app.js"), "console.log('app')").unwrap();

        let mut cache = FileCache::new();
        cache
            .load_from_directory(base_path.to_str().unwrap())
            .unwrap();

        // Should only load app.js, not the file in node_modules
        assert_eq!(cache.len(), 1);
        assert!(cache.get_all()[0].path.contains("app.js"));
    }

    #[test]
    fn test_file_size_limit() {
        let temp_dir = TempDir::new().unwrap();
        let base_path = temp_dir.path();

        // Create large file
        let large_content = "x".repeat(2_000_000); // 2MB
        fs::write(base_path.join("large.js"), &large_content).unwrap();

        // Create small file
        fs::write(base_path.join("small.js"), "console.log('small')").unwrap();

        let mut cache = FileCache::new();
        cache
            .load_from_directory(base_path.to_str().unwrap())
            .unwrap();

        // Should only load small.js (default max is 1MB)
        assert_eq!(cache.len(), 1);
        assert!(cache.get_all()[0].path.contains("small.js"));
    }

    #[test]
    fn test_get_by_extension() {
        let temp_dir = TempDir::new().unwrap();
        let base_path = temp_dir.path();

        fs::write(base_path.join("file1.rs"), "fn test1() {}").unwrap();
        fs::write(base_path.join("file2.rs"), "fn test2() {}").unwrap();
        fs::write(base_path.join("file3.ts"), "function test3() {}").unwrap();

        let mut cache = FileCache::new();
        cache
            .load_from_directory(base_path.to_str().unwrap())
            .unwrap();

        let rs_files = cache.get_by_extension("rs");
        assert_eq!(rs_files.len(), 2);

        let ts_files = cache.get_by_extension("ts");
        assert_eq!(ts_files.len(), 1);
    }

    #[test]
    fn test_cache_stats() {
        let temp_dir = TempDir::new().unwrap();
        let base_path = temp_dir.path();

        fs::write(base_path.join("file1.rs"), "fn test() {}").unwrap();
        fs::write(base_path.join("file2.ts"), "const x = 1").unwrap();

        let mut cache = FileCache::new();
        cache
            .load_from_directory(base_path.to_str().unwrap())
            .unwrap();

        let stats = cache.stats();
        assert_eq!(stats.total_files, 2);
        assert!(stats.total_bytes > 0);
        assert_eq!(stats.extension_counts.get("rs"), Some(&1));
        assert_eq!(stats.extension_counts.get("ts"), Some(&1));
    }
}
