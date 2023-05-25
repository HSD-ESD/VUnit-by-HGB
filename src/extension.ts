/* ------------------------------------------------------------------------------------------
 * MIT License
 * Copyright (c) 2020 Henrik Bohlin
 * Full license text can be found in /LICENSE or at https://opensource.org/licenses/MIT.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { VUnitAdapter } from './adapter';
import * as path from 'path';
import * as fs from 'fs';

import { VunitTestController } from './VunitTestController';

export async function activate(context: vscode.ExtensionContext) {
    
    //create instance of test-controller for VUnit
    let testController : VunitTestController = new VunitTestController(context);
    
}
