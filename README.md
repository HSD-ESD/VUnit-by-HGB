# VUnit Test Explorer (preview)

Run your [VUnit](https://vunit.github.io/) tests from the Sidebar of Visual Studio Code.

![UI example](/img/screenshot.png?raw=true)

# Configuration

The following configuration properties are available:

Property                              | Description
--------------------------------------|---------------------------------------------------------------
`vunit-by-hgb.python`                 | Path to python executable.
`vunit.flattenSingleLibrary`          | Flatten library hierarchy in explorer when all tests are contained within a single library.
`vunit-by-hgb.shellOptions`           | VUnit run.py command line options when running tests.
`vunit-by-hgb.guiOptions`             | VUnit run.py command line options when running GUI (-g should not be added here).
`vunit.exportJsonOptions`             | VUnit run.py command line options when discovering test with --export-json.
`vunit-by-hgb.matchProblems`          | Display Errors and Warnings from VUnit as Problems
`vunit-by-hgb.matchAssertionFailure`  | Display Assertion-Failures from VUnit as Problems
# Commands

The following commands are available in VS Code's command palette, use the ID to add them to your keyboard shortcuts:

ID                                   | Command
-------------------------------------|--------------------------------------------


# Dependencies

This extension uses the [Testing API from Visual Studio Code].
This extension is published under the GNU GPL license.