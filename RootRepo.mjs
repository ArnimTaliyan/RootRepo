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

        // Initialize the repository (create necessary directories and files)
        this.ready = this.init();
    }

    async init() {
        // Ensure the objects directory exists
        await fs.mkdir(this.objectsPath, {recursive: true});

        try {
            // Create an empty HEAD file if it does not exist
            await fs.writeFile(this.headPath, '', {flag: 'wx'}); // wx: open for writing, error if file exists

            // Create an empty index file if it does not exist
            await fs.writeFile(this.indexPath, JSON.stringify([]), {flag: 'wx'});

            console.log("Initialized the .root folder");
        } catch (error) {
            console.log("Already initialized the .root folder");
        }

        // Ensure the index file exists (create an empty one if missing)
        try {
            await fs.access(this.indexPath); // Check if index exists
        } catch (error) {
            await fs.writeFile(this.indexPath, JSON.stringify([])); // Create if missing
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

        // Update the staging area with the file path and hash
        await this.updateStagingArea(fileToBeAdded, fileHash);

        console.log(`Added ${fileToBeAdded}`);
    }

    async updateStagingArea(filePath, fileHash) {
        // Read the current index (staging area) from the index file
        const index = JSON.parse(await fs.readFile(this.indexPath, {encoding: 'utf-8'}));

        // Add the new file entry with its hash
        index.push({ path: filePath, hash: fileHash });

        // Write the updated index back to the file
        await fs.writeFile(this.indexPath, JSON.stringify(index));
    }

    async commit(message) {
        // Read the current staging area (index) before committing
        const index = JSON.parse(await fs.readFile(this.indexPath, {encoding: 'utf-8'}));

        // If no files are staged, prevent commit
        if (index.length === 0) {
            console.log("Nothing to commit");
            return;
        }
        
        // Get the parent commit hash from HEAD (if any)
        const parentCommit = (await this.getCurrentHead()) || null;
    
        // Create a commit object containing timestamp, commit message, staged files, and parent commit reference
        const commitData = {
            timeStamp: new Date().toISOString(), // Store the current time of commit
            message, // Store the commit message provided by the user
            filex: index, // Include the staged files from the index
            parent: parentCommit // Reference the parent commit (empty if first commit)
        };

        // Compute the commit hash using SHA-256
        const commitHash = this.hashObject(JSON.stringify(commitData));

        // Define the commit file path
        const commitDir = path.join(this.objectsPath, commitHash.substring(0, 2)); 
        const commitPath = path.join(commitDir, commitHash.substring(2));

        // Ensure the commit directory exists
        await fs.mkdir(commitDir, {recursive: true});

        // Write the commit data to the commit file
        await fs.writeFile(commitPath, JSON.stringify(commitData));

        // Update HEAD to point to the new commit
        await fs.writeFile(this.headPath, commitHash);

        // Clear the staging area after commit
        await fs.writeFile(this.indexPath, JSON.stringify([]));

        console.log(`Committed with hash: ${commitHash}`);
    }
    
    async getCurrentHead(){
        try {
            // Read the current HEAD file to get the latest commit hash
            return await fs.readFile(this.headPath, {encoding: 'utf-8'});
        } catch (error) {
            return null; // Return null if HEAD file does not exist
        }
    }

    async log(){
        let currentCommitHash = await this.getCurrentHead();

        while(currentCommitHash) {
            const commitData = JSON.parse(await fs.readFile(path.join(this.objectsPath, currentCommitHash.substring(0, 2), currentCommitHash.substring(2)), {encoding: 'utf-8'}));

            console.log(`\nCommit: ${currentCommitHash}\nDate: ${commitData.timeStamp}\nMessage: ${commitData.message}`);

            currentCommitHash = commitData.parent;
        }
    }

}

(async () => {
    // Create an instance of RootRepo
    const rootRepo = new RootRepo();
    
    await rootRepo.add('sample.txt');
    
    await rootRepo.commit('Second commit');

    await rootRepo.log();
})();