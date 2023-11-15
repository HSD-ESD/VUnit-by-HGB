//specific imports
import { VUnit } from "./VUnit";
import { VunitExportData } from "./VUnitPackage";

//general imports
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import exp = require("constants");
import readline = require('readline');
import { ChildProcess } from "child_process";

//--------------------------------------------
// module-internal constants
//--------------------------------------------

//TestBench-Status-Matcher
const cVunitTestEnd : RegExp = /(pass|fail) \(.*\) (.*) \(.*\)/;
const cVunitTestStart : RegExp = /Starting (.*)/;
const cVunitStopped : RegExp = /Stopped at ([^\s]+) line (\d+)/;

export class VUnitTestController {

    //--------------------------------------------
	//Private Members
	//--------------------------------------------

    //vs-code-members
    private mContext : vscode.ExtensionContext;
    private mOutputChannel : vscode.OutputChannel;
    private mFolderWatcher : vscode.FileSystemWatcher;
    private mDiagnosticCollection : vscode.DiagnosticCollection;

    //specific members
    private mTestController : vscode.TestController;
    private mRunProfile : vscode.TestRunProfile;
    private mDebugProfile : vscode.TestRunProfile;

    private mWorkSpacePath : string = "";
    private mVUnit : VUnit;

    //--------------------------------------------
	//Public Methods
	//--------------------------------------------
    public constructor(context : vscode.ExtensionContext) {

        //initialize vs-code-members
        this.mContext = context;
        this.mOutputChannel = vscode.window.createOutputChannel("VUnitByHGB.VUnitTestController");
        this.mDiagnosticCollection = vscode.languages.createDiagnosticCollection('VUnitByHGB.VUnitErrors');

        //initialize specific members
        this.mVUnit = new VUnit();

        //get workspace-path of extension
        const workSpacePath = this.mVUnit.GetWorkspaceRoot(); 
        if(workSpacePath) { this.mWorkSpacePath = workSpacePath; }
        // watch folder of extension
        const testPath = path.join(this.mWorkSpacePath, "*");
        this.mFolderWatcher = vscode.workspace.createFileSystemWatcher(path.join(this.mWorkSpacePath, "**/*"));
        
        //handle events for FolderWatcher
        this.mFolderWatcher.onDidCreate( (uri) => {
            if(uri.fsPath.endsWith("run.py"))
            {
                this.LoadTests();
            }
        });
        this.mFolderWatcher.onDidDelete( (uri) => {
            if(uri.fsPath.endsWith("run.py"))
            {
                this.LoadTests();
            }
        });
        this.mFolderWatcher.onDidChange( (uri) => {
            if(uri.fsPath.endsWith("run.py"))
            {
                this.LoadTests();
            }
        });

        // Start watching the workspace-folder
        const disposable = vscode.Disposable.from(this.mFolderWatcher);
        // Dispose the watcher when extension is not active
        context.subscriptions.push(disposable);

        // create TestController for VUnit
        this.mTestController = vscode.tests.createTestController('vunit-test-controller', 'VUnit TestController');
        this.mContext.subscriptions.push(this.mTestController);

        //create profile for running Tests
        this.mRunProfile = this.mTestController.createRunProfile(
                                'Run', 
                                vscode.TestRunProfileKind.Run, 
                                (request, token) => {
                                    this.RunTests(false, request, token);
                            });
        
        //create profile for debugging tests
        this.mDebugProfile = this.mTestController.createRunProfile(
                                'Debug',
                                vscode.TestRunProfileKind.Debug,
                                (request, token) => {
                                    this.RunTests(true, request, token);
                            });

        //resolve-handler for initial loading of testcases in User-Interface
        this.mTestController.resolveHandler = load => {
            this.LoadTests();
        };

        //refresh-handler for manual refreshing of testcases in User-Interface
        this.mTestController.refreshHandler = load => {
            this.LoadTests();
        };
    }
    
    public async RunTests(
        shouldDebug: boolean,
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) : Promise<void>
    {
        const run : vscode.TestRun = this.mTestController.createTestRun(request);

        this.mDiagnosticCollection.clear();

        //specific selection of elements from User-Interface should be run
        if (request.include) {

            //set all selected testcases to "running-mode" for spinning wheel in UI
            await Promise.all(request.include.map(t => this.traverseNode(t, request, run, startNode)));

            //execute selected test-cases on console
            if (!shouldDebug)
            {
                await this.RunVUnitTestsShell(request.include[0], request, run);
            }
            //execute selected test-cases in GUI
            else if (shouldDebug)
            {
                await this.RunVUnitTestsGUI(request.include[0], request, run);
            }

        } 
        // all testcases should be run
        else {
            
            //get all top-level items (all run.py-scripts)
            const TopLevelItems : vscode.TestItem[] = mapTestItems(this.mTestController.items, item => item); 

            //set all testcases to "enqueued-mode" in UI
            Promise.all(TopLevelItems.map(t => this.traverseNode(t, request, run, enqueueNode)));

            //execute all test-cases on console
            if (!shouldDebug)
            {
                for(const item of TopLevelItems)
                {
                    //set all selected testcases to "running-mode" for spinning wheel in UI
                    await this.traverseNode(item, request, run, startNode);
                    await this.RunVUnitTestsShell(item, request, run);
                }
            }
            //execute all test-cases in GUI
            else if (shouldDebug)
            {
                for(const item of TopLevelItems)
                {
                    await this.RunVUnitTestsGUI(item, request, run);
                }
            }
        }
        
        run.end();
    }

    public async LoadTests() : Promise<void>
    {
        

        //Find all Run.Py-Files in WorkSpace
        const RunPyFiles : string[] = await this.mVUnit.FindRunPy((vscode.workspace.workspaceFolders || [])[0]);

        if (this.mTestController.items.size === 0)
        {
            //just pick the first run.py of all found run.py-files and get vunit-version
            await this.mVUnit.GetVunitVersion(RunPyFiles[0])
                .then((res) => {
                    this.mOutputChannel.append(`Found VUnit version ${res}`);
                })
                .catch((err) => {
                    this.mOutputChannel.append(err);
                });
        }

        //delete all old items
        for(const [id,item] of this.mTestController.items)
        {
            this.mTestController.items.delete(id);
        }

        //load all RunPy parallely
        await Promise.all(RunPyFiles.map((RunPy) => this.LoadRunPy(RunPy)));
    }

    private async LoadRunPy(RunPy : string) : Promise<boolean>
    {
        // get data for each run.py-file
        const exportData: VunitExportData = await this.mVUnit.GetVunitData(this.mWorkSpacePath, RunPy);

        //relative path from workspace-folder to run-py-file 
        const RunPyPath : string = path.relative(this.mWorkSpacePath, RunPy);

        //create test-item for selected run.py
        let runPyItem : vscode.TestItem = this.mTestController.createTestItem(RunPy,RunPyPath, vscode.Uri.file(RunPy));
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
            const libraryID = getLibraryItemId(RunPy, libraryName);
            let libraryItem : vscode.TestItem | undefined = runPyItem.children.get(libraryID);

            // create node for library if not existing yet
            if (!libraryItem)
            {
                libraryItem = this.mTestController.createTestItem(libraryID, libraryName);
                runPyItem.children.add(libraryItem);
            }

            // get item of testbench
            const testBenchID = getTestBenchItemId(RunPy, libraryName, testBenchName);
            let testBenchItem : vscode.TestItem | undefined = libraryItem.children.get(testBenchID);
            
            //create node for testbench if not existing yet
            if (!testBenchItem)
            {
                testBenchItem = this.mTestController.createTestItem(testBenchID, testBenchName, vscode.Uri.file(testcase.location.file_name));
                libraryItem.children.add(testBenchItem);
            }

            //create node for testcase
            const testCaseID : string = getTestCaseItemId(RunPy, testcase.name);
            const testCaseItem : vscode.TestItem = this.mTestController.createTestItem(testCaseID, testCaseName, vscode.Uri.file(testcase.location.file_name));
            testCaseItem.range = GetTestbenchRange(testcase.location.file_name, testcase.location.offset, testcase.location.length);

            testBenchItem.children.add(testCaseItem);
        }

        return true;
    }

    private async traverseNode(
        node: vscode.TestItem,
	    request: vscode.TestRunRequest,
	    run: vscode.TestRun,
        callback : (node: vscode.TestItem, run : vscode.TestRun) => void
    ) : Promise<void>
    {
        if (request.exclude?.includes(node)) {
            return;
        }

        if (node.children.size > 0)
        {
            // recurse all children if this is a "suite"
            await Promise.all(mapTestItems(node.children, t => this.traverseNode(t, request, run, callback)));
        }
        else
        {
            callback(node, run);
        }
    }

    private findNode(itemId: string, node: vscode.TestItem): vscode.TestItem | undefined 
    {
        if (node.id === itemId) {
          return node;
        }
      
        if (node.children.size > 0) {
          for (const [id, testNode] of node.children) {
            const result = this.findNode(itemId, testNode);
            if (result) {
              return result;
            }
          }
        }
      
        return undefined;
    }

    private async RunVUnitTestsShell(node : vscode.TestItem, request: vscode.TestRunRequest, run: vscode.TestRun) : Promise<void>
    {
        //extract run.py path
        const runPyPath = node.id.split('|')[0];
        //wildcard-appendix
        let wildcardAppendix : string = "";
        //check, if this node is a test-suite
        if(node.children.size > 0)
        {
            wildcardAppendix = ".*";
        }
        //Extract testcase-name from testcase-ID
        let testCaseWildCard : string = "";

        //check, if node is a top-level node
        if(node.parent)
        {
            testCaseWildCard = '"' + node.id.split('|')[1] + wildcardAppendix + '"';
        }
        //Command-Line-Arguments for VUnit
        let options = [testCaseWildCard, '--no-color', '--exit-0'];

        const vunitOptions = vscode.workspace
            .getConfiguration()
            .get('vunit-by-hgb.shellOptions');
        if (vunitOptions) {
            options.push(vunitOptions as string);
        }   

        //variable for referencing output from vunit-process to analyse its output
        let vunitProcess : any;

        //necessary for determining, which file caused an assertion failure
        let IsAssertionFailure : Boolean = false;

        //launch vunit-process with given arguments from above
        await this.mVUnit.Run(runPyPath, options, (vunit: ChildProcess) => {
            
            // handle cancellation of test-suite
            let disposable = run.token.onCancellationRequested(() => {
                vunit.kill();
                this.traverseNode(node, request, run, skipRunningNode);
            });
            this.mContext.subscriptions.push(disposable);

            // append output to testcase
            vunit.stdout?.on('data', (data : string) => {
                run.appendOutput(data);
            });
            vunit.stderr?.on('data', (data : string) => {
                run.appendOutput(data);
            });
            
            vunitProcess = vunit;

            readline
                .createInterface({
                    input: vunitProcess.stdout,
                    terminal: false,
                })
                .on('line', (line: string) => {

                    //check for success/failure of VUnit-TestCase
                    this.MatchTestCaseStatus(line, node, run, runPyPath);

                    //match VUnit-Errors
                    if(vscode.workspace.getConfiguration().get('vunit-by-hgb.matchProblems'))
                    {
                        this.mVUnit.MatchProblems(line, this.mDiagnosticCollection); 
                    }

                    //match VUnit-Assertion-Failure
                    if(vscode.workspace.getConfiguration().get('vunit-by-hgb.matchAssertionFailure'))
                    {
                        // Check for assertion failure
                        if (line.includes('** Error: Assertion violation.') && !IsAssertionFailure) {
                            IsAssertionFailure = true;
                        }

                        if(IsAssertionFailure)
                        {
                            this.MatchAssertionFailure(line, IsAssertionFailure);
                        }
                    }

                });
        }).finally(() => {
            vunitProcess = 0;
        })
        .catch((err) => {
            run.errored(node, new vscode.TestMessage("Error in Execution of " + runPyPath));
        });

    }

    private async RunVUnitTestsGUI(node: vscode.TestItem, request: vscode.TestRunRequest, run: vscode.TestRun) : Promise<void>
    {
        //extract run.py path
        const runPyPath = node.id.split('|')[0];

        //wildcard-appendix
        let wildcardAppendix : string = "";
        //check, if this node is a test-suite
        if(node.children.size > 0)
        {
            wildcardAppendix = ".*";
        }
        //Extract testcase-name from testcase-ID
        let testCaseWildCard : string = "";

        //check, if node is a top-level node
        if(node.parent)
        {
            testCaseWildCard = '"' + node.id.split('|')[1] + wildcardAppendix + '"';
        }

        //Command-Line-Arguments for VUnit
        let options = [testCaseWildCard, '--no-color', '--exit-0', '-g'];

        const vunitOptions = vscode.workspace
            .getConfiguration()
            .get('vunit-by-hgb.guiOptions');
        if (vunitOptions) {
            options.push(vunitOptions as string);
        }
        
        await this.mVUnit.Run(runPyPath, options, (vunit: ChildProcess) => { 
            // handle cancellation of test-suite
            let disposable = run.token.onCancellationRequested(() => {
                vunit.kill();
            });
            this.mContext.subscriptions.push(disposable);
        });

    }

    private MatchTestCaseStatus(line : string, node : vscode.TestItem, run : vscode.TestRun, runPyPath : string) : void
    {

        //check for pass or fail
        const result = cVunitTestEnd.exec(line);
        if (result) {

            const testCaseItemId : string = getTestCaseItemId(runPyPath, result[2]);

            //evaluate result
            if(result[1] === 'pass')
            {
                //get related test-item
                const item = this.findNode(testCaseItemId, node);
                if(item) 
                { 
                    run.passed(item); 
                }
            }
            else
            {
                //get related test-item
                const item = this.findNode(testCaseItemId, node);
                if(item) 
                { 
                    run.failed(item, new vscode.TestMessage(result[2] + " failed!")); 
                }
                
            }
        }

    }

    private MatchAssertionFailure(line : string, IsAssertionFailure : Boolean) : void
    {
        const match = cVunitStopped.exec(line);
        if (match) {
            const assertionFile = match[1];
            const assertionLineNumber = parseInt(match[2]);
            
            const diagnostic: vscode.Diagnostic = {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(assertionLineNumber - 1, 0, assertionLineNumber - 1, 0),
                message: 'Assertion violation.',
                source: 'VUnit',
            };

            // check for existing diagnostics for this file
            if (this.mDiagnosticCollection.has(vscode.Uri.file(assertionFile))) 
            {
                const currentDiagnostics = this.mDiagnosticCollection.get(vscode.Uri.file(assertionFile));

                if (currentDiagnostics) {

                    //avoid duplication of same diagnostic
                    const isDuplicateDiagnostic = currentDiagnostics.some((existingDiagnostic) => {
                        return existingDiagnostic.range.isEqual(diagnostic.range) && existingDiagnostic.message === diagnostic.message;
                    });

                    if (!isDuplicateDiagnostic) {
                        // add new diagnostic to existing diagnostic-list
                        const updatedDiagnostics = currentDiagnostics.concat(diagnostic);
                        this.mDiagnosticCollection.set(vscode.Uri.file(assertionFile), updatedDiagnostics);
                    }

                }
            } 
            else 
            {
                // if no existing diagnostics, add a new diagnostic
                this.mDiagnosticCollection.set(vscode.Uri.file(assertionFile), [diagnostic]);
            }

            //reset boolean for efficiently detecting other assertion failures
            IsAssertionFailure = false;
        }
    }
}


//--------------------------------------------
//Helper Methods
//--------------------------------------------

// Small helper that works like "array.map" for children of a test collection
const mapTestItems = <T>(items: vscode.TestItemCollection, mapper: (t: vscode.TestItem) => T): T[] => {
	const result: T[] = [];
	items.forEach(t => result.push(mapper(t)));
	return result;
};

function getTestCaseItemId(runPyPath : string, testCaseName : string) : string
{
    const testCaseId : string = runPyPath.concat("|", testCaseName);
    return testCaseId;
}

function getLibraryItemId(runPyPath : string, libraryName : string) : string 
{
    const libraryItemId : string = runPyPath.concat("|", libraryName);
    return libraryItemId;
}

function getTestBenchItemId(runPyPath : string, libraryName : string, testBenchName : string) : string 
{
    const testBenchItemId : string = runPyPath.concat("|", libraryName, ".", testBenchName);
    return testBenchItemId;
}

function GetTestbenchRange(filePath : string, offset : number, testcaseNameLength : number) : vscode.Range
{
    const testBenchSrc : string = fs.readFileSync(filePath, 'utf8');
    const linesUntilTestcase : string[] = testBenchSrc.substring(0, offset).split(/\r?\n/);
    const testCaseStartLine = linesUntilTestcase.length - 1;
    //const testcaseEndLine : number = testBenchSrc.substring(offset, testBenchSrc.length).split(/\r?\n/).findIndex(line => IsTestbenchEnd(line));
    return new vscode.Range(new vscode.Position(testCaseStartLine, 0), new vscode.Position(testCaseStartLine, 0));
}

function skipRunningNode(node : vscode.TestItem, run : vscode.TestRun) : void {

    if (node.busy)
    {
        run.skipped(node);
    }
}

function startNode(node : vscode.TestItem, run : vscode.TestRun) : void 
{
    run.started(node);
}

function enqueueNode(node : vscode.TestItem, run : vscode.TestRun) : void 
{
    run.enqueued(node);
}

function IsTestbenchEnd(line : string) : boolean
{
    //empty
    return true;
}
