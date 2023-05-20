//specific imports
import { VUnit } from "./VUnit/VUnit";
import * as vunit from "./vunit";
import { VunitExportData } from "./VUnit/VUnitPackage";

//general imports
import * as vscode from 'vscode';
import * as path from 'path';
import exp = require("constants");
import readline = require('readline');
import { ChildProcess } from "child_process";

export class VunitTestController {

    //--------------------------------------------
	//Private Members
	//--------------------------------------------

    //vs-code-members
    private mContext : vscode.ExtensionContext;
    private mOutputChannel : vscode.OutputChannel;

    //specific members
    private mTestController : vscode.TestController;
    private mRunProfile : vscode.TestRunProfile;
    private mDebugProfile : vscode.TestRunProfile;

    private mWorkSpacePath : string = "";
    private mVunit : VUnit;

    private mVunitProcess! : any;

    //--------------------------------------------
	//Public Methods
	//--------------------------------------------
    public constructor(context : vscode.ExtensionContext) {

        //initialize vs-code-members
        this.mContext = context;
        this.mOutputChannel = vscode.window.createOutputChannel("VUnitTestController");

        //initialize specific members
        this.mVunit = new VUnit();

        //get workspace-path of extension
        const workSpacePath = vunit.getWorkspaceRoot();
        if(workSpacePath) { this.mWorkSpacePath = workSpacePath; }

        // create TestController for VUnit
        this.mTestController = vscode.tests.createTestController('vunit-test-controller', 'VUnit TestController');
        this.mContext.subscriptions.push(this.mTestController);

        //create profile for running Tests
        this.mRunProfile = this.mTestController.createRunProfile('Run', vscode.TestRunProfileKind.Run, request => this.RunTests(request), true);

        //create profile for debugging tests
        this.mDebugProfile = this.mTestController.createRunProfile('Debug', vscode.TestRunProfileKind.Debug, request => this.RunTests(request), true);

        this.mTestController.resolveHandler = test => {
            //this.mTestController.items.replace( );
            //this.LoadTests();
        };
    }

    public async RunTests(request : vscode.TestRunRequest)
    {
        //this.mTestController.items.replace(vunit.loadVunitTests(this.mWorkSpacePath))

        const run : vscode.TestRun = this.mTestController.createTestRun(request);

        if (request.include) {
            await Promise.all(request.include.map(t => this.runNode(t, request, run)));
        } else {
            await Promise.all(mapTestItems(this.mTestController.items, t => this.runNode(t, request, run)));
        }
    
        run.end();
    }

    public async LoadTests()
    {
        if (this.mTestController.items.size === 0)
        {
            await this.mVunit.GetVunitVersion()
                .then((res) => {
                    this.mOutputChannel.append(`Found VUnit version ${res}`);
                })
                .catch((err) => {
                    this.mOutputChannel.append(err);
                });
        }

        //Find all Run.Py-Files in WorkSpace
        const RunPyFiles : string[] = await this.mVunit.FindRunPy((vscode.workspace.workspaceFolders || [])[0]);

        // Create TestTree for each Run.Py-File
        for(const RunPy of RunPyFiles)
        {
            // get data for each run.py-file
            const exportData: VunitExportData = await this.mVunit.GetVunitData(this.mWorkSpacePath);

            //relative path from workspace-folder to run-py-file 
            const RunPyPath : string = path.relative(this.mWorkSpacePath, RunPy);

            //create test-item for selected run.py
            let runPyItem : vscode.TestItem = this.mTestController.createTestItem(RunPy,RunPyPath);
            this.mTestController.items.add(runPyItem);

            // add all testcases to specified run.py-testcase-item
            for(const testcase of exportData.tests)
            {
                // split testcase-string into tokens
                let split = testcase.name.split('.');
                let libraryName = split[0];
                let testBenchName = split[1];
                let testCaseName = split.slice(2).join('.');

                // get item of library
                const libraryID = RunPyPath.concat(".", libraryName);
                let libraryItem : vscode.TestItem | undefined = runPyItem.children.get(libraryID);

                // create node for library if not existing yet
                if (!libraryItem)
                {
                    libraryItem = this.mTestController.createTestItem(libraryID, libraryName);
                    runPyItem.children.add(libraryItem);
                }

                // get item of testbench
                const testBenchID = RunPyPath.concat(".", testBenchName);
                let testBenchItem : vscode.TestItem | undefined = libraryItem.children.get(testBenchID);
                
                //create node for testbench if not existing yet
                if (!testBenchItem)
                {
                    testBenchItem = this.mTestController.createTestItem(testBenchID, testBenchName);
                    libraryItem.children.add(testBenchItem);
                }

                //create node for testcase
                    //const testCaseID = RunPyPath.concat(".", testcase.name);
                const testCaseItem : vscode.TestItem = this.mTestController.createTestItem(testcase.name, testCaseName);
                testBenchItem.children.add(testCaseItem);

            }

        }
    }

    // @ added by Jakob
    private async runNode(
        node: vscode.TestItem,
	    request: vscode.TestRunRequest,
	    run: vscode.TestRun,
    ): Promise<void> {
    
    // check for filter on test
        if (request.exclude?.includes(node)) {
            return;
        }

        if (node.children.size > 0) 
        {
            // recurse and run all children if this is a "suite"
            await Promise.all(mapTestItems(node.children, t => this.runNode(t, request, run)));
        }
        else
        {
            const testCaseWildCard : string = '"' + node.id + '"';
            let options = [testCaseWildCard, '--no-color', '--exit-0'];
            const vunitOptions = vscode.workspace
                .getConfiguration()
                .get('vunit.options');
            if (vunitOptions) {
                options.push(vunitOptions as string);
            }   

            await this.mVunit.RunVunit(options, (vunit: ChildProcess) => {
                this.mVunitProcess = vunit;
                const testStart = /Starting (.*)/;
                const testEnd = /(pass|fail) \(.*\) (.*) \(.*\)/;
                readline
                    .createInterface({
                        input: this.mVunitProcess.stdout,
                        terminal: false,
                    })
                    .on('line', (line: string) => {
                        let start = testStart.exec(line);
                        if (start) {
                            run.started(node);
                        }
                        let result = testEnd.exec(line);
                        if (result) {

                            const message : vscode.TestMessage = new vscode.TestMessage("failed");

                            //evaluate result
                            result[1] === 'pass' ? run.passed(node) : run.failed(node, message);
                        }
                    });
            }).finally(() => {
                this.mVunitProcess = null;
            });

        }
    }


}



//--------------------------------------------
//Helper Methods
//--------------------------------------------



// Small helper that works like "array.map" for children of a test collection
export const mapTestItems = <T>(items: vscode.TestItemCollection, mapper: (t: vscode.TestItem) => T): T[] => {
	const result: T[] = [];
	items.forEach(t => result.push(mapper(t)));
	return result;
};