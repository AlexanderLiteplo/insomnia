# Contributing to Claude Manager-Worker

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes
6. Commit with clear messages
7. Push to your fork
8. Open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/claude-manager-worker.git
cd claude-manager-worker

# Make scripts executable
chmod +x scripts/*.sh

# Run a test to verify setup
./scripts/orchestrator.sh status
```

## Code Style

### Bash Scripts

- Use `set -e` to fail fast on errors
- Use meaningful variable names
- Add comments for complex logic
- Follow [Google's Shell Style Guide](https://google.github.io/styleguide/shellguide.html)

### Markdown

- Use ATX-style headers (`#`)
- Include code blocks with language identifiers
- Keep lines under 100 characters where possible

## Pull Request Process

1. **Title**: Use a clear, descriptive title
2. **Description**: Explain what changes you made and why
3. **Testing**: Describe how you tested your changes
4. **Breaking Changes**: Clearly note any breaking changes

## What to Contribute

### Highly Valued

- Bug fixes with test cases
- Performance improvements
- Documentation improvements
- New skill templates
- Better error handling

### Good Ideas

- Support for additional languages/frameworks in PRDs
- Integration with CI/CD systems
- Dashboard/monitoring improvements
- Configuration file support (.cmwrc)

### Please Discuss First

- Major architectural changes
- New dependencies
- Changes to the core loop mechanism

## Testing

Before submitting a PR:

1. Test with a simple PRD (use the sample)
2. Verify both Worker and Manager start correctly
3. Check that status command works
4. Ensure clean shutdown with stop command

## Questions?

Open an issue with the "question" label, and we'll be happy to help!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
