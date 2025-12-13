# Security Policy

## Our Security Commitment

In-Memoria is committed to maintaining the security and privacy of developers using our AI-assisted development infrastructure. Given our role in analyzing codebases and providing intelligence to AI assistants, we take security seriously.

**Latest Security Updates (v0.7.0)**:
- ✅ **Path Traversal Protection** - Comprehensive validation prevents directory traversal attacks
- ✅ **Rate Limiting** - DoS protection with configurable sliding-window rate limiting
- ✅ **Circuit Breaker Resilience** - Automatic fallback mechanisms for external service failures

## Supported Versions

Security updates are provided for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | ✅ Yes             |
| 0.3.x   | ⚠️ Security fixes only |
| < 0.3   | ❌ No              |

## Security Principles

### Local-First Security
- **All data stays local** - no code or intelligence data is transmitted to external servers
- **No telemetry** - In-Memoria doesn't collect usage data or send analytics
- **100% offline** - All vector embeddings generated locally using transformers.js

### Data Protection
- **Filesystem access** - Only reads files you explicitly analyze with path validation
- **Path security** - PathValidator enforces project boundaries and prevents traversal attacks
- **Database security** - SQLite database stored locally with no external access
- **Memory safety** - Rust core provides memory-safe code analysis
- **Rate limiting** - MCP tool calls are rate-limited to prevent abuse
- **Circuit breaker** - Automatic fallback to local storage when external services fail

### AI Integration Security
- **MCP protocol compliance** - Follows MCP security standards for AI tool integration
- **Rate limiting** - Sliding-window rate limiting protects against excessive tool calls
- **Sandboxed execution** - Analysis runs in isolated processes
- **No code execution** - Only static analysis, never executes analyzed code
- **Path validation** - All file paths are validated to prevent directory traversal

## Reporting Security Vulnerabilities

**Please DO NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by emailing the maintainer directly. You can find the email address in the `package.json` file under the `author` field.

### What to Include

When reporting a vulnerability, please include:

1. **Component affected** (Rust core, TypeScript layer, MCP integration, CLI)
2. **Vulnerability type** (code injection, path traversal, data exposure, etc.)
3. **Steps to reproduce** the security issue
4. **Potential impact** and affected systems
5. **Suggested mitigation** if you have ideas

### Example Security Concerns

Please report issues like:
- **Code injection** through malicious file content
- **Path traversal** vulnerabilities in file analysis (mitigated by PathValidator)
- **Data exposure** of analyzed code to unintended recipients
- **MCP protocol** security bypasses or rate limiting circumvention
- **Memory safety** issues in Rust bindings
- **Privilege escalation** in CLI commands
- **Supply chain** vulnerabilities in dependencies
- **DoS attacks** via excessive MCP tool calls (mitigated by rate limiting)

## Security Best Practices for Users

### Safe Usage
- **Review permissions** - Only run In-Memoria on codebases you trust
- **Limit scope** - Use file patterns to exclude sensitive directories
- **Regular updates** - Keep In-Memoria updated to latest secure version
- **Environment isolation** - Consider running in containers for sensitive codebases

### MCP Integration Security
- **Validate MCP clients** - Only connect trusted AI assistants
- **Review tool permissions** - Understand what data MCP tools can access
- **Monitor tool usage** - Be aware of what analysis tools are being called
- **Rate limiting awareness** - Default 100 requests/minute per client; configurable
- **Path validation** - All file operations are bounded to project directories

### Data Handling
- **Backup intelligence** - Intelligence databases are local assets
- **Access control** - Protect `.in-memoria.db` files with appropriate file permissions
- **Clean up** - Remove intelligence data when no longer needed

## Response Timeline

- **Acknowledgment**: Within 48 hours of receiving the report
- **Initial assessment**: Within 1 week
- **Status updates**: Weekly until resolved
- **Resolution**: Based on severity (Critical: <72h, High: <2weeks, Medium: <1month)

## Disclosure Policy

- Security vulnerabilities will be disclosed responsibly
- Fixes will be released before public disclosure
- Credit will be given to security researchers (if desired)
- CVE numbers will be requested for significant vulnerabilities

## Security Architecture

### Rust Core Security
- **Memory safety** - No buffer overflows or use-after-free vulnerabilities
- **Input validation** - All file content and user input is validated
- **Error handling** - Proper error propagation prevents crashes
- **Dependency auditing** - Regular security audits of Rust dependencies

### TypeScript Layer Security
- **Path validation** - PathValidator prevents directory traversal attacks
- **Rate limiting** - Sliding-window rate limiter prevents DoS attacks
- **Circuit breaker** - Automatic fallback mechanisms for resilience
- **Input sanitization** - File paths and CLI arguments are sanitized
- **Process isolation** - Child processes run with limited privileges
- **Error boundaries** - Proper error handling prevents information leaks
- **Dependency management** - Regular npm audit and updates

### Security Components

#### PathValidator
- **Purpose**: Prevents path traversal attacks and enforces project boundaries
- **Mechanism**: Validates all file paths are relative and within project root
- **Coverage**: Applied to all MCP tools and CLI entry points
- **Error handling**: Clear error messages for invalid paths

#### RateLimiter
- **Purpose**: Prevents DoS attacks via excessive MCP tool calls
- **Mechanism**: Sliding-window rate limiting with configurable limits
- **Default**: 100 requests per minute per client
- **Configurable**: Window size and request limits can be adjusted

#### CircuitBreaker
- **Purpose**: Provides resilience against external service failures
- **Mechanism**: Automatic fallback to local storage when vector DB fails
- **Transparency**: Users unaware of backend failures unless they persist
- **Recovery**: Automatic recovery when external services become available

## Contact

For security-related questions or concerns:
- **Email**: Check package.json for maintainer contact
- **Response time**: 48 hours for security-related inquiries
- **PGP key**: Available upon request for sensitive communications

---

**Last updated**: November 2025  
**Policy version**: 1.1
