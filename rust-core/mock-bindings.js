// Mock implementation for testing when Rust binaries are not available
module.exports = {
  SemanticAnalyzer: class MockSemanticAnalyzer {
    constructor() {}
    analyzeCodebase() {
      return {
        concepts: [],
        relationships: [],
        metrics: { complexity: 0, maintainability: 0 }
      };
    }
    learnFromCodebase() {
      return [];
    }
  },
  
  PatternLearner: class MockPatternLearner {
    constructor() {}
    learnPatterns() {
      return {
        patterns: [],
        confidence: 0.5
      };
    }
    extractPatterns() {
      return [];
    }
  },
  
  AstParser: class MockAstParser {
    constructor() {}
    parse() {
      return {
        nodes: [],
        symbols: []
      };
    }
  },
  
  BlueprintAnalyzer: class MockBlueprintAnalyzer {
    constructor() {}
    analyze() {
      return {
        blueprint: {},
        recommendations: []
      };
    }
  },
  
  FrameworkDetector: class MockFrameworkDetector {
    constructor() {}
    detect() {
      return {
        frameworks: [],
        confidence: 0.5
      };
    }
  },
  
  initCore: () => {
    console.log('[MOCK] Rust core initialized with mock implementation');
  },
  
  // Additional exports that might be needed
  ApproachPredictor: class MockApproachPredictor {
    constructor() {}
    predict() {
      return { approach: 'mock', confidence: 0.5 };
    }
  },
  
  ComplexityAnalyzer: class MockComplexityAnalyzer {
    constructor() {}
    analyze() {
      return { complexity: 0, metrics: {} };
    }
  },
  
  ImplementationPatternAnalyzer: class MockImplementationPatternAnalyzer {
    constructor() {}
    analyze() {
      return { patterns: [] };
    }
  },
  
  NamingPatternAnalyzer: class MockNamingPatternAnalyzer {
    constructor() {}
    analyze() {
      return { patterns: [] };
    }
  },
  
  ParserManager: class MockParserManager {
    constructor() {}
    parse() {
      return { result: {} };
    }
  },
  
  PatternLearningEngine: class MockPatternLearningEngine {
    constructor() {}
    learn() {
      return { patterns: [] };
    }
  },
  
  RelationshipLearner: class MockRelationshipLearner {
    constructor() {}
    learn() {
      return { relationships: [] };
    }
  },
  
  StructuralPatternAnalyzer: class MockStructuralPatternAnalyzer {
    constructor() {}
    analyze() {
      return { patterns: [] };
    }
  }
};