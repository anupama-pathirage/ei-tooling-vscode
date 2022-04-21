/*
Copyright (c) 2019, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
*
* WSO2 Inc. licenses this file to you under the Apache License,
* Version 2.0 (the "License"); you may not use this file except
* in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied. See the License for the
* specific language governing permissions and limitations
* under the License.
*/

import {Uri, window, workspace, WorkspaceEdit, WorkspaceFolder, languages} from "vscode";
import * as fse from "fs-extra";
import * as path from 'path';
//import {ServerRoleInfo, DataServiceInfo} from "./dataServiceUtils";
import {XMLSerializer as XMLSerializer} from 'xmldom';
import {ArtifactModule} from "../artifacts/ArtifactModule";
import {DataServiceModule} from "../dataService/DataServiceModule";
import { ServerRoleInfo } from "../artifacts/artifactUtils";
import { dir } from "console";
import { version } from "process";
import { SubDirectories } from "../artifacts/artifactUtils";
import {SYNAPSE_LANGUAGE_ID, SYNAPSE_NAMESPACE} from "../language/languageUtils";

let DOM = require('xmldom').DOMParser;
let glob = require("glob");
const YAML = require("js-yaml");
var fs = require('fs');
var filewatcher = require('filewatcher');

export namespace MediatorProjectModule {

    const dirName = __dirname;

    export async function createProject(projectName: string, packageName: string, className: string) {
        if (workspace.workspaceFolders) {

            //check whether project name already exists
            let rootDirectory: string = workspace.workspaceFolders[0].uri.fsPath;
            let mediatorProjectDirectory: string = path.join(rootDirectory, projectName);
            if(fse.existsSync(mediatorProjectDirectory)){
                window.showErrorMessage("Mediator project name already exists!");
                return;
            }

            //create directory structure
            let packageSubdirectories: string[] = packageName.split(".");
            let packageSubDirPath: string = packageSubdirectories.join(path.sep);
            let javaFilePath: string = path.join(rootDirectory, projectName, "src", "main", "java", packageSubDirPath);
            fs.mkdirSync(javaFilePath, {recursive: true});

            let rootPomFilePath: string = path.join(rootDirectory, "pom.xml");
            let mediatorProjectPomFilePath: string = path.join(rootDirectory, projectName, "pom.xml");
            let project: ArtifactModule.Project = await ArtifactModule.getProjectInfoFromPOM(rootPomFilePath);

            //add new pom.xml
            let templatePomFilePath: string = path.join(dirName, "..", "..", "templates", "pom", "MediatorProjectPom.xml");
            const buff: Buffer = fse.readFileSync(templatePomFilePath);
            let pomXmlDoc = new DOM().parseFromString(buff.toString(), "text/xml");

            let artifactIds =pomXmlDoc.getElementsByTagName("artifactId");
            let groupIds =pomXmlDoc.getElementsByTagName("groupId");
            let versions =pomXmlDoc.getElementsByTagName("version");
            let childProjectName = pomXmlDoc.getElementsByTagName("name")[0];
            let childProjectDescription = pomXmlDoc.getElementsByTagName("description")[0];
            let bundleSymbolicName = pomXmlDoc.getElementsByTagName("Bundle-SymbolicName")[0];
            let bundleName = pomXmlDoc.getElementsByTagName("Bundle-Name")[0];
            let exportPackage = pomXmlDoc.getElementsByTagName("Export-Package")[0];

            //parent
            artifactIds[0].textContent = project.artifactId;
            groupIds[0].textContent = project.groupId;
            versions[0].textContent = project.version;

            //child
            artifactIds[1].textContent = projectName;
            groupIds[1].textContent = packageName;
            versions[1].textContent = "1.0.0";
            childProjectName.textContent = projectName;
            childProjectDescription.textContent = projectName;
            bundleSymbolicName.textContent = projectName;
            bundleName.textContent = projectName;
            exportPackage.textContent = packageName;

            DataServiceModule.createFile(mediatorProjectPomFilePath, pomXmlDoc);

            //add new .project file
            let templateProjNatureFilePath: string = path.join(dirName, "..", "..", "templates", "Conf", "mediatorProject.xml");
            const buf: Buffer = fse.readFileSync(templateProjNatureFilePath);
            let projectNature  = new DOM().parseFromString(buf.toString(), "text/xml");

            let name = projectNature.getElementsByTagName("name")[0];
            name.textContent = projectName.trim(); 

            let projectNatureFilePath: string = path.join(rootDirectory, projectName, ".project");
            DataServiceModule.createFile(projectNatureFilePath, projectNature);

            //add new .classpath file
            let templateclassPathFilePath: string = path.join(dirName, "..", "..", "templates", "Conf", "mediatorProjectClassPath.xml");
            const buffer: Buffer = fse.readFileSync(templateclassPathFilePath);
            let classPath  = new DOM().parseFromString(buffer.toString(), "text/xml");

            let classPathFilePath: string = path.join(rootDirectory, projectName, ".classpath");
            DataServiceModule.createFile(classPathFilePath, classPath);

            //add mediatorProject module to root pom
            const rootPomBuffer: Buffer = fse.readFileSync(rootPomFilePath);
            let rootPomXmlDoc = new DOM().parseFromString(rootPomBuffer.toString(), "text/xml");
            let modules = rootPomXmlDoc.getElementsByTagName("modules")[0];
            let firstModule = modules.getElementsByTagName("module")[0];
            let mediatorProjectChild = rootPomXmlDoc.createElement("module");
            mediatorProjectChild.textContent = projectName;
            rootPomXmlDoc.insertBefore(mediatorProjectChild, firstModule);

            fse.writeFileSync(rootPomFilePath, new XMLSerializer().serializeToString(rootPomXmlDoc));

            //update composite pom
            let compositePomFilePath: string = path.join(ArtifactModule.getDirectoryFromProjectNature(SubDirectories.COMPOSITE_EXPORTER), "pom.xml");
            const pomBuff: Buffer = fse.readFileSync(compositePomFilePath);
            let pomXml = new DOM().parseFromString(pomBuff.toString(), "text/xml");

            //add new property
            let tagName: string = packageName + "_._" + projectName;
            let properties = pomXml.getElementsByTagName("properties");
            ArtifactModule.addNewProperty(pomXml, tagName, properties, ServerRoleInfo.ENTERPRISE_SERVICE_BUS);

            //add new dependancy
            let dependencies = pomXml.getElementsByTagName("dependencies");
            ArtifactModule.addNewDependancy(pomXml, dependencies, projectName, packageName);
            fse.writeFileSync(compositePomFilePath, new XMLSerializer().serializeToString(pomXml));

            //create sample java class
            let sampleJavaClassfilePath: string = path.join(javaFilePath, className + ".java");
            //let templateJavaFilePath: string = path.join(dirName, "..", "..", "templates", "mediator-project", "SampleClass.txt");
            /*const javaBuffer: Buffer = fs.readFileSync(templateJavaFilePath,'utf8');
            let tmpData: string = javaBuffer.toString();
            tmpData.replace("packageName", "Hi");
            tmpData.replace("className", className);*/
            //console.log(tmpData);

            const data: string = 
            `package ${packageName};
            
            import org.apache.synapse.MessageContext; 
            import org.apache.synapse.mediators.AbstractMediator;
        
            public class ${className} extends AbstractMediator {
        
            public boolean mediate(MessageContext context) { 
                // TODO Implement your mediation logic here 
                return true;
            }
            }`;

            //console.log(data);

            let fileUri:Uri = Uri.file(sampleJavaClassfilePath);
            let edit = new WorkspaceEdit();
            edit.createFile(fileUri);
            workspace.applyEdit(edit);
            fse.writeFileSync(fileUri.fsPath, data);

           
            // Open and show newly created java file in the editor.
            workspace.openTextDocument(fileUri).then(doc => window.showTextDocument(doc));
    

            
        }
    }
    
}