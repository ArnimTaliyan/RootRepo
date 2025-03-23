import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

class RootRepo {

    constructor(repoPath = '.'){
        // Define the main .root directory where repository metadata will be stored
        this.repoPath = path.join(repoPath, '.root');

        // Path to store all versioned objects (blobs, commits, trees, etc.)
        this.objectsPath = path.join(this.repoPath, 'objects'); // .root/objects

        // Path to the HEAD file, which points to the current branch or commit
        this.headPath = path.join(this.repoPath, 'HEAD'); // .root/HEAD

         // Path to the index (staging area), which tracks changes before committing
        this.indexPath = path.join(this.repoPath, 'index'); // .root/index

        this.init();
    }

    async init() {
        await fs.mkdir(this.objectsPath, {recursive: true});

        try {
            // Create an empty HEAD file if it does not exist
            await fs.writeFile(this.headPath, ' ', {flag: 'wx'}); // wx: open for writing, error if file exists

            // Create an empty index file if it does not exist
            await fs.writeFile(this.indexPath, JSON.stringify([]), {flag: 'wx'});

            console.log("Initialized the .root folder");
        } catch (error) {
            console.log("Aready initialized the .root folder");
        }
    }

    hashObject(content) {
        // Generate a SHA-256 hash for the given content
        return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
    }

    async add(fileToBeAdded) {
        // Read the content of the file to be added
        const fileData = await fs.readFile(fileToBeAdded, {encoding: 'utf-8'});

        // Compute the SHA-256 hash of the file content
        const fileHash = this.hashObject(fileData);

        console.log(fileHash);

        // Define the path where the hashed object will be stored inside the objects directory
        const objectDir = path.join(this.objectsPath, fileHash.substring(0, 2)); // First two characters as directory

        const objectFilePath = path.join(objectDir, fileHash.substring(2)); // Rest as filename


        // Ensure the object directory exists
        await fs.mkdir(objectDir, { recursive: true });

        // Write the original file content to the hashed object file inside .root/objects
        await fs.writeFile(objectFilePath, fileData);

        await this.updateStagingArea(fileToBeAdded, fileHash);

        console.log(`Added ${fileToBeAdded}`);
    }

    async updateStagingArea(filePath, fileHash) {
        const index = JSON.parse(await fs.readFile(this.indexPath, 'utf-8')); // read index file

        index.push({ path: filePath, hash: fileHash }); // add the new file to the index

        await fs.writeFile(this.indexPath, JSON.stringify(index)); // write the updated index back to the file
    }
}

const rootRepo = new RootRepo();
rootRepo.add('sample.txt');