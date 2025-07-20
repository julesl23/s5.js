# Phase 4 Utility Functions Tests

This directory contains the test suite for Phase 4 of the S5.js SDK implementation, focusing on directory utility functions for walking and batch operations.

## Test Files

### 1. `walker.test.ts`
Tests for the `DirectoryWalker` class, covering:
- Recursive and non-recursive directory traversal
- File and directory filtering options
- Custom filter functions
- Maximum depth limiting
- Cursor-based resume functionality
- Depth tracking for each entry
- Directory statistics counting

### 2. `batch.test.ts`
Tests for the `BatchOperations` class, covering:
- Directory copying with metadata preservation
- Overwrite control (skip vs overwrite existing files)
- Progress callback support
- Error handling with stopOnError option
- Resumable operations using cursors
- Recursive directory deletion
- Nested directory creation

### 3. `utils-integration.test.ts`
Integration tests demonstrating:
- Combined walker and batch operations for selective copying
- Large-scale operations with cursor pagination
- Verifying copy completeness using walker
- Error recovery and cleanup scenarios

### 4. `utils-performance.test.ts`
Performance tests for:
- Walking 1000+ files efficiently
- Copying large directories with progress tracking
- Cursor pagination efficiency
- Complex nested directory deletion

## Test Utilities

The tests use a shared `setupMockS5()` function from `test/test-utils.ts` that provides:
- Mock S5 API implementation with in-memory storage
- Mock identity for file system operations
- Consistent test environment setup

## Running the Tests

```bash
# Run all utility tests
npm test test/fs/utils

# Run specific test file
npm test test/fs/utils/walker.test.ts

# Run with coverage
npm run test:coverage test/fs/utils
```

## Implementation Notes

These tests follow a Test-Driven Development (TDD) approach, defining the expected behavior before implementation. The actual implementation files should be created at:

- `src/fs/utils/walker.ts` - DirectoryWalker implementation
- `src/fs/utils/batch.ts` - BatchOperations implementation

The tests cover all requirements specified in the Phase 4 design documentation, including edge cases, error handling, and performance considerations.