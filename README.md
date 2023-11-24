# VUnitByHGB

VUnitByHGB is a Visual Studio Code extension that makes it easy to debug and run [VUnit](https://vunit.github.io/) testcases from the sidebar of VS-Code. 
This Extension is maintained by Jakob Jungreuthmayer at [University of Applied Sciences Upper Austria - Campus Hagenberg](https://www.fh-ooe.at/campus-hagenberg/studiengaenge/bachelor/hardware-software-design/). 

## Features
- List all VUnit testcases from multiple run.py scripts
- Run VUnit testcases 
- Debug  VUnit testcases in GUI mode
- Go-To-Source: Jump to the run script
- Go-To-Testcase: Jump to the implementation of a testcase 
- Highlight failed/passed testcases
- Highlight failed assertions
- Parallel execution of testcases

![UI example](/img/screenshot.png?raw=true)

### Usage
1. Make sure that VUnit is installed (e.g. using ```pip install vunit_hdl```)
1. Open a folder that contains a run.py script
2. Open any VHDL or python file to activate the extension
3. Open the Testing-SideViewContainer on the left menu bar
4. All Testcases should be displayed. From here, you can:
    - Press the run button to run a unit test in background
    - Press the debug button to run a test in GUI mode
    - Jump to the definition of a testcase

## History
This Visual Studio Code extension is a fork of VUnit Test Explorer by [Henrik Bohlin](https://github.com/Bochlin), was no longer maintained.
In 2023, [Jakob Jungreuthmayer](https://github.com/jakobjung10) made the following major changes during his bachelor`s degree at [University of Applied Sciences Upper Austria - Campus Hagenberg](https://www.fh-ooe.at/campus-hagenberg/):
- Ported to the official VS-Code-Testing-API
- Added support for multiple run.py scripts in the workspace
- Added problem matchers for Python and Modelsim/Questasim output

## Contributing
Contributing in the form of code, documentation, feedback, tutorial, ideas or bug reports is very welcome. 

## Maintainers: 
- 2019 - 2020: [Henrik Bohlin](https://github.com/Bochlin)
- since 2023: [Jakob Jungreuthmayer](https://github.com/jakobjung10)

## Configuration

The following configuration properties are available:

Property                              | Description
--------------------------------------|---------------------------------------------------------------
`vunit-by-hgb.scriptname`                   | consistent name of all VUnit-run-scripts (default: `run.py`)
`vunit-by-hgb.python`                       | Path to python executable.
`vunit-by-hgb.shellOptions`                 | VUnit run.py command line options when running tests.
`vunit-by-hgb.guiOptions`                   | VUnit run.py command line options when running GUI (-g should not be added here).
`vunit-by-hgb.exportJsonOptions`            | VUnit run.py command line options when discovering test with --export-json.
`vunit-by-hgb.showExecutionTime`            | Display Execution-Time for every testcase
`vunit-by-hgb.executeMultipleGuiTestcases`  | Executing multiple GUI-Testcases at once
`vunit-by-hgb.matchProblems`                | Display Errors and Warnings from VUnit as Problems
`vunit-by-hgb.matchAssertionFailure`        | Display Assertion-Failures from VUnit as Problems

## Related Projects
- HDLRegression is an alternative to VUnit. Use [HDLRegressionByHGB](https://github.com/HSD-ESD/HDLRegression-by-HGB) to run HDLRegression tests from the VS-Code sidebar. (currently under development) 

## License

This extension is published under the [GNU GPL license](/LICENSE).
