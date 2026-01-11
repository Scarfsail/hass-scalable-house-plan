# Agent Notes

## Semantic Release & Build Triggers

This project uses **semantic-release** with the Angular commit convention to automatically trigger builds and releases.

### Configuration
Located in `package.json` under the `release` section:
- Uses `@semantic-release/commit-analyzer` with Angular preset
- Releases are created from the `main` branch
- Build artifacts are uploaded to GitHub releases

### Commit Message Format

Commits must follow the **Angular Convention** to trigger builds:

```
<type>(<scope>): <subject>
```

#### Types that trigger releases:

| Type | Description | Release Type | Example |
|------|-------------|--------------|---------|
| `feat` | New feature | **Minor** (1.x.0) | `feat: add blurred overlay to detail view` |
| `fix` | Bug fix | **Patch** (1.0.x) | `fix: correct polygon transparency issue` |
| `perf` | Performance improvement | **Patch** (1.0.x) | `perf: optimize room color calculations` |
| `chore(deps)` | Dependency update | **Patch** (1.0.x) | `chore(deps): update lit to 3.3.2` |

#### Types that DO NOT trigger releases:

- `docs` - Documentation changes
- `style` - Code style/formatting changes
- `refactor` - Code refactoring (no behavior change)
- `test` - Test additions or changes
- `chore` - Build process, tooling (except `chore(deps)`)
- `ci` - CI/CD configuration changes

### Breaking Changes

To trigger a **Major** release (x.0.0), add `BREAKING CHANGE:` in the commit body:

```
feat: redesign configuration structure

BREAKING CHANGE: Room configuration now requires explicit entity objects
instead of string shortcuts. Update your configuration accordingly.
```

### Best Practices

1. **Always use appropriate prefixes** (`feat:` or `fix:`) when making changes that should trigger a build
2. **Be specific in commit messages** - helps with auto-generated release notes
3. **Use scopes** when applicable: `feat(detail-view):`, `fix(room-colors):`
4. **Test locally first** before committing to avoid unnecessary release cycles
5. **Use conventional commits** even for non-release types to maintain consistent history

### Quick Reference

- **New feature?** → `feat:`
- **Bug fix?** → `fix:`
- **Performance improvement?** → `perf:`
- **Dependency update?** → `chore(deps):`
- **Documentation only?** → `docs:` (no release)
- **Refactoring?** → `refactor:` (no release)

## Build Commands

This project uses **Vite** for building. Available npm scripts in `package.json`:

| Command | Description |
|---------|-------------|
| `npm run build-dev` | Build for development with source maps (`vite build --mode development`) |
| `npm run build-prod` | Build for production, minified (`vite build`) |
| `npm run watch` | Build in watch mode for development (`vite build --watch --mode development`) |

**Note:** This project does NOT have a `npm run build` command. Use `build-dev` or `build-prod` instead.
