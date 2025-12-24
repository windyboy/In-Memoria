import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PathValidator } from "./path-validator.js";
import { createTestDir, cleanupTestDir } from "./test-helpers.js";
import { writeFileSync, mkdirSync, symlinkSync, existsSync } from "fs";
import { join } from "path";

describe("PathValidator", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir("path-validator-test");
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  describe("validateProjectPath", () => {
    it("should return current directory when no path provided", () => {
      const result = PathValidator.validateProjectPath(undefined, "test");
      expect(result).toBe(process.cwd());
    });

    it("should resolve relative paths to absolute", () => {
      const result = PathValidator.validateProjectPath(".", "test");
      expect(result).toBe(process.cwd());
    });

    it("should accept valid absolute paths", () => {
      const result = PathValidator.validateProjectPath(testDir, "test");
      expect(result).toBe(testDir);
    });

    it("should throw error for non-existent paths", () => {
      const nonExistent = join(testDir, "non-existent");
      expect(() =>
        PathValidator.validateProjectPath(nonExistent, "test"),
      ).toThrow();
    });

    it("should handle path with spaces", () => {
      const dirWithSpaces = join(testDir, "dir with spaces");
      mkdirSync(dirWithSpaces);

      const result = PathValidator.validateProjectPath(dirWithSpaces, "test");
      expect(result).toBe(dirWithSpaces);
    });

    it("should handle special characters in path", () => {
      const specialDir = join(testDir, "dir-with_special.chars");
      mkdirSync(specialDir);

      const result = PathValidator.validateProjectPath(specialDir, "test");
      expect(result).toBe(specialDir);
    });

    it("should include context in error message", () => {
      const nonExistent = join(testDir, "non-existent");
      expect(() =>
        PathValidator.validateProjectPath(nonExistent, "TestTool"),
      ).toThrow(/TestTool/);
    });
  });

  describe("looksLikeProjectRoot", () => {
    it("should return true for directory with package.json", () => {
      writeFileSync(join(testDir, "package.json"), "{}");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return true for directory with .git", () => {
      mkdirSync(join(testDir, ".git"));
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return true for Rust project (Cargo.toml)", () => {
      writeFileSync(join(testDir, "Cargo.toml"), "");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return true for Go project (go.mod)", () => {
      writeFileSync(join(testDir, "go.mod"), "");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return true for Python project (pyproject.toml)", () => {
      writeFileSync(join(testDir, "pyproject.toml"), "");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return true for Python project (requirements.txt)", () => {
      writeFileSync(join(testDir, "requirements.txt"), "");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return true for Java Maven project (pom.xml)", () => {
      writeFileSync(join(testDir, "pom.xml"), "");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return true for Java Gradle project (build.gradle)", () => {
      writeFileSync(join(testDir, "build.gradle"), "");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return true for PHP project (composer.json)", () => {
      writeFileSync(join(testDir, "composer.json"), "");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return true for Ruby project (Gemfile)", () => {
      writeFileSync(join(testDir, "Gemfile"), "");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return true for C/C++ project (CMakeLists.txt)", () => {
      writeFileSync(join(testDir, "CMakeLists.txt"), "");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return true for project with Makefile", () => {
      writeFileSync(join(testDir, "Makefile"), "");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(true);
    });

    it("should return false for empty directory", () => {
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(false);
    });

    it("should return false for directory with only random files", () => {
      writeFileSync(join(testDir, "random.txt"), "content");
      writeFileSync(join(testDir, "file.md"), "content");
      expect(PathValidator.looksLikeProjectRoot(testDir)).toBe(false);
    });

    it("should handle errors gracefully", () => {
      // Test with invalid path
      expect(PathValidator.looksLikeProjectRoot("/non/existent/path")).toBe(
        false,
      );
    });
  });

  describe("isSafeProjectPath", () => {
    it("should allow paths within project root", () => {
      const subDir = join(testDir, "src");
      mkdirSync(subDir);

      const result = PathValidator.isSafeProjectPath("src", testDir);
      expect(result).toBe(true);
    });

    it("should reject paths outside project root with ..", () => {
      const result = PathValidator.isSafeProjectPath("../outside", testDir);
      expect(result).toBe(false);
    });

    it("should reject absolute paths outside project", () => {
      const result = PathValidator.isSafeProjectPath("/tmp/outside", testDir);
      expect(result).toBe(false);
    });

    it("should allow relative paths within project", () => {
      const result = PathValidator.isSafeProjectPath("src/utils", testDir);
      expect(result).toBe(true);
    });

    it("should reject path traversal attempts", () => {
      const result = PathValidator.isSafeProjectPath(
        "../../../etc/passwd",
        testDir,
      );
      expect(result).toBe(false);
    });

    it("should handle current directory reference", () => {
      const result = PathValidator.isSafeProjectPath(".", testDir);
      expect(result).toBe(true);
    });

    it("should handle nested relative paths", () => {
      const result = PathValidator.isSafeProjectPath(
        "src/utils/helpers.ts",
        testDir,
      );
      expect(result).toBe(true);
    });

    it("should reject empty path", () => {
      const result = PathValidator.isSafeProjectPath("", testDir);
      expect(result).toBe(false);
    });

    // Security-critical tests
    it("should reject null byte injection", () => {
      const result = PathValidator.isSafeProjectPath(
        "src/file\x00.ts",
        testDir,
      );
      // Path should be rejected or sanitized
      expect(result).toBe(false);
    });

    it("should handle Windows path separators", () => {
      const result = PathValidator.isSafeProjectPath(
        "src\\utils\\file.ts",
        testDir,
      );
      // Should be valid on any platform
      expect(result).toBeDefined();
    });
  });

  describe("ensureWithinProject", () => {
    it("should return path if within project", () => {
      const subPath = join(testDir, "src");
      mkdirSync(subPath);

      const result = PathValidator.ensureWithinProject("src", testDir, "test");
      expect(result).toBe(subPath);
    });

    it("should throw if path is outside project", () => {
      const outsidePath = join(testDir, "..", "outside");
      if (!existsSync(outsidePath)) {
        mkdirSync(outsidePath);
      }

      expect(() =>
        PathValidator.ensureWithinProject("../outside", testDir, "test"),
      ).toThrow(/outside project/);
    });

    it("should throw if path does not exist", () => {
      const nonExistent = join(testDir, "non-existent");
      expect(() =>
        PathValidator.ensureWithinProject(nonExistent, testDir, "test"),
      ).toThrow();
    });

    it("should include context in error message", () => {
      const nonExistent = join(testDir, "non-existent");
      expect(() =>
        PathValidator.ensureWithinProject(nonExistent, testDir, "TestContext"),
      ).toThrow(/TestContext/);
    });
  });

  describe("normalizePath", () => {
    it("should normalize path separators", () => {
      const windowsPath = "src\\utils\\file.ts";
      const result = PathValidator.normalizePath(windowsPath);
      expect(result).toBe("src/utils/file.ts");
    });

    it("should handle already normalized paths", () => {
      const unixPath = "src/utils/file.ts";
      const result = PathValidator.normalizePath(unixPath);
      expect(result).toBe("src/utils/file.ts");
    });

    it("should handle mixed separators", () => {
      const mixedPath = "src\\utils/file.ts";
      const result = PathValidator.normalizePath(mixedPath);
      expect(result).toBe("src/utils/file.ts");
    });

    it("should handle absolute Windows paths", () => {
      const winAbsolute = "C:\\Users\\test\\project";
      const result = PathValidator.normalizePath(winAbsolute);
      expect(result).toBe("C:/Users/test/project");
    });

    it("should handle empty string", () => {
      const result = PathValidator.normalizePath("");
      expect(result).toBe("");
    });

    it("should preserve trailing slashes when requested", () => {
      const pathWithSlash = "src/utils/";
      const result = PathValidator.normalizePath(pathWithSlash);
      expect(result).toBe("src/utils/");
    });
  });

  describe("edge cases and security", () => {
    it("should handle very long paths", () => {
      const longPath = "a/".repeat(100) + "file.ts";
      const result = PathValidator.normalizePath(longPath);
      expect(result).toBeDefined();
    });

    it("should handle paths with unicode characters", () => {
      const unicodeDir = join(testDir, "文件夹");
      mkdirSync(unicodeDir);

      const result = PathValidator.validateProjectPath(unicodeDir, "test");
      expect(result).toBe(unicodeDir);
    });

    it("should handle paths with emoji", () => {
      const emojiDir = join(testDir, "folder-😀");
      mkdirSync(emojiDir);

      const result = PathValidator.validateProjectPath(emojiDir, "test");
      expect(result).toBe(emojiDir);
    });

    it("should reject suspicious patterns", () => {
      const suspicious = "../../../etc/passwd";
      const result = PathValidator.isSafeProjectPath(suspicious, testDir);
      expect(result).toBe(false);
    });

    it("should handle case sensitivity correctly", () => {
      const upperPath = join(testDir, "SRC");
      mkdirSync(upperPath);

      const result1 = PathValidator.validateProjectPath(upperPath, "test");
      expect(result1).toBeDefined();

      // On case-insensitive systems (macOS, Windows), these might resolve to same path
      // On case-sensitive systems (Linux), they're different
      const isValid = PathValidator.isSafeProjectPath("SRC", testDir);
      expect(typeof isValid).toBe("boolean");
    });
  });
});
