//specific imports
import { VUnit } from "./VUnit/VUnit";
import * as vunit from "./vunit";
import { VunitExportData } from "./VUnit/VUnitPackage";

//general imports
import * as vscode from 'vscode';
import exp = require("constants");

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
            await Promise.all(request.include.map(t => runNode(t, request, run)));
        } else {
            await Promise.all(mapTestItems(this.mTestController.items, t => runNode(t, request, run)));
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

        // create items for each found run.py
        this.mVunit.FindRunPy((vscode.workspace.workspaceFolders || [])[0]);

        //only temporary
        const exportData: VunitExportData = await this.mVunit.GetVunitData(this.mWorkSpacePath);

        let tbFiles: string[] = [];

        for(const testcase of exportData.tests)
        {
            let split = testcase.name.split('.');
            let libraryName = split[0];
            let testBenchName = split[1];
            let testCaseName = split.slice(2).join('.');

            let item : vscode.TestItem = this.mTestController.createTestItem(testcase.name, testCaseName);
            
            this.mTestController.items.add(item);
        }

    }


}



//--------------------------------------------
//Helper Methods
//--------------------------------------------

// @ added by Jakob
export async function runNode(
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
		await Promise.all(mapTestItems(node.children, t => runNode(t, request, run)));
    }
    else
    {
        run.started(node);

        
        
    }
}

// Small helper that works like "array.map" for children of a test collection
export const mapTestItems = <T>(items: vscode.TestItemCollection, mapper: (t: vscode.TestItem) => T): T[] => {
	const result: T[] = [];
	items.forEach(t => result.push(mapper(t)));
	return result;
};