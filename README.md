# VUnit Test Controller (preview)

Run your [VUnit](https://vunit.github.io/) tests from the Sidebar of Visual Studio Code.

![UI example](/img/screenshot.png?raw=true)

# Features

- Listing all VUnit-Testcases
- Running VUnit-Testcases
- Debug VUnit-Testcase in GUI
- Go-To-Source
- Go-To-Testcase
- Highlight failed/passed tests
- Highlight failed assertions
- Multiple run.py supported

# Usage

1. Open a folder that contains a HDL-Project and a run.py
2. Open the Testing-SideViewContainer on the left menu bar
3. All Testcases should be displayed

# Configuration

The following configuration properties are available:

Property                              | Description
--------------------------------------|---------------------------------------------------------------
`vunit-by-hgb.python`                 | Path to python executable.
`vunit-by-hgb.shellOptions`           | VUnit run.py command line options when running tests.
`vunit-by-hgb.guiOptions`             | VUnit run.py command line options when running GUI (-g should not be added here).
`vunit-by-hgb.exportJsonOptions`             | VUnit run.py command line options when discovering test with --export-json.
`vunit-by-hgb.matchProblems`          | Display Errors and Warnings from VUnit as Problems
`vunit-by-hgb.matchAssertionFailure`  | Display Assertion-Failures from VUnit as Problems
# Commands

The following commands are available in VS Code's command palette, use the ID to add them to your keyboard shortcuts:

ID                                   | Command
-------------------------------------|--------------------------------------------

# Credits
[VUnit Test Explorer](https://github.com/Bochlin/vunit-test-explorer)

Fork of VUnit Test Explorer by Henrik Bohlin, since the original project is no longer maintained.

Differences:
---
- Ported to official VS-Code-Testing-API
- Multiple run.py
- IDE-Features (errors)

# Dependencies

This extension uses the [Testing API from Visual Studio Code](https://code.visualstudio.com/api/extension-guides/testing).

# License

This extension is published under the GNU GPL license.