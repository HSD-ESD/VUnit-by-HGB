// specific imports
import { VUnitTestController } from "../../VUnit/VUnitTestController";

// general imports
import * as vscode from 'vscode';

// variables
let VUnitByHGB : VUnitTestController;

export async function getExtension() : Promise<VUnitTestController | undefined>
{
    if (!VUnitByHGB)
    {
        const extension = vscode.extensions.getExtension('p2l2.vunit-by-hgb');

        if (!extension)
        {
            return undefined;
        }

        if (!extension.isActive)
        {
            VUnitByHGB = await extension.activate();
        }
        else
        {
            VUnitByHGB = extension.exports;
        }
    }

    return VUnitByHGB;
}