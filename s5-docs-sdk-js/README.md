# Enhanced s5.js Documentation for S5 Docs Integration

This folder contains mdBook-formatted documentation for the Enhanced s5.js JavaScript/TypeScript SDK, ready to be integrated into the S5 documentation site at https://docs.sfive.net/.

## What's Included

- **Complete mdBook structure** with table of contents
- **9 documentation pages** covering installation, tutorials, API guides, and reference
- **Matching style** aligned with existing S5 documentation conventions
- **Ready to integrate** as Section 8: "SDKs & Libraries"

## Integration Instructions

### Option 1: Direct Integration (Recommended)

1. Copy the `src/` folder contents into your S5 docs `src/` directory:
   ```bash
   cp -r s5-docs-sdk-js/src/* /path/to/s5-docs/src/
   ```

2. Update your main `SUMMARY.md` to add Section 8:
   ```markdown
   # ... existing sections ...

   # SDKs & Libraries

   - [JavaScript/TypeScript (Enhanced s5.js)](./sdk/javascript/index.md)
     - [Installation & Setup](./sdk/javascript/installation.md)
     - [Quick Start](./sdk/javascript/quick-start.md)
     - [Path-based API Guide](./sdk/javascript/path-api.md)
     - [Media Processing](./sdk/javascript/media.md)
     - [Advanced CID API](./sdk/javascript/advanced-cid.md)
     - [Performance & Scaling](./sdk/javascript/performance.md)
     - [Directory Utilities](./sdk/javascript/utilities.md)
     - [Encryption](./sdk/javascript/encryption.md)
     - [API Reference](./sdk/javascript/api-reference.md)
   ```

3. Rebuild the S5 documentation:
   ```bash
   mdbook build
   ```

### Option 2: Test Standalone First

To preview the SDK documentation independently:

1. Install mdBook if not already installed:
   ```bash
   cargo install mdbook
   ```

2. Build and serve locally:
   ```bash
   cd s5-docs-sdk-js
   mdbook serve --open
   ```

3. View at `http://localhost:3000`

## File Structure

```
s5-docs-sdk-js/
├── book.toml                          # mdBook configuration
├── src/
│   ├── SUMMARY.md                     # Table of contents
│   ├── introduction.md                # SDKs section intro
│   └── sdk/
│       └── javascript/
│           ├── index.md               # Overview
│           ├── installation.md        # Installation & Setup
│           ├── quick-start.md         # Quick Start Tutorial
│           ├── path-api.md            # Path-based API Guide
│           ├── media.md               # Media Processing
│           ├── advanced-cid.md        # Advanced CID API
│           ├── performance.md         # Performance & Scaling
│           ├── utilities.md           # Directory Utilities
│           ├── encryption.md          # Encryption
│           └── api-reference.md       # Complete API Reference
└── README.md                          # This file
```

## Style Conventions

The documentation follows S5 docs conventions:

- **Concise, technical tone** matching existing S5 documentation
- **TypeScript code examples** with syntax highlighting
- **Tables** for structured API information
- **Blockquotes** for important notes and warnings
- **Progressive complexity** from basic to advanced
- **External links** to npm package and GitHub repository

## Content Source

Documentation is derived from:
- `docs/API.md` (API specifications)
- `demos/getting-started-tutorial.js` (working examples)
- `docs/BENCHMARKS.md` (performance data)
- Real-world usage patterns and best practices

## Package Information

- **npm**: [@s5-dev/s5js](https://www.npmjs.com/package/@s5-dev/s5js)
- **GitHub**: [julesl23/s5.js](https://github.com/julesl23/s5.js)
- **Version**: 0.9.0-beta.1
- **License**: MIT OR Apache-2.0

## Questions?

For questions about the SDK or documentation:
- GitHub Issues: https://github.com/julesl23/s5.js/issues
- S5 Protocol Discord: https://discord.gg/s5protocol
- Email: [contact info]

## Maintenance

This documentation should be kept in sync with Enhanced s5.js releases. For updates:
1. Update the relevant markdown files in `src/sdk/javascript/`
2. Rebuild the documentation with `mdbook build`
3. Test changes locally before integration

---

**Ready to integrate!** Simply copy the contents and rebuild the S5 documentation site.
