//specific imports
import { VUnit } from "./VUnit/VUnit";
import * as vunit from "./vunit";

//general imports
import * as vscode from 'vscode';

export class VunitTestController {

    //--------------------------------------------
	//Private Members
	//--------------------------------------------

    //vs-code-members
    private mContext : vscode.ExtensionContext;

    //specific members
    private mTestController : vscode.TestController;
    private mRunProfile : vscode.TestRunProfile;
    private mWorkSpacePath : string = "";
    private mVunit : VUnit;

    //--------------------------------------------
	//Public Methods
	//--------------------------------------------
    public constructor(context : vscode.ExtensionContext) {

        //initialize vs-code-members
        this.mContext = context;

        //initialize specific members
        this.mVunit = new VUnit();

        const workSpacePath = vunit.getWorkspaceRoot();
        if(workSpacePath) { this.mWorkSpacePath = workSpacePath; }

        // create TestController for VUnit
        this.mTestController = vscode.tests.createTestController('vunit-test-controller', 'VUnit TestController');
        this.mContext.subscriptions.push(this.mTestController);

        this.mRunProfile = this.mTestController.createRunProfile('Run', vscode.TestRunProfileKind.Run, request => this.RunTests(request), true);

        // this.mTestController.resolveHandler = test => {
        //     this.mTestController.items.replace( );
        // }
    }


    public async RunTests(request : vscode.TestRunRequest)
    {
        //this.mTestController.items.replace(vunit.loadVunitTests(this.mWorkSpacePath))

        const run : vscode.TestRun = this.mTestController.createTestRun(request);

        if (request.include) {
            await Promise.all(request.include.map(t => vunit.runNode(t, request, run)));
        } else {
            await Promise.all(vunit.mapTestItems(this.mTestController.items, t => vunit.runNode(t, request, run)));
        }
    
        run.end();
    }

}
