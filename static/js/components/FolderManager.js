export class FolderManager {
    constructor(apiService) {
        this.apiService = apiService;
    }

    async createFolder(name, parentId = null) {
        const folder = await this.apiService.post('/create_folder', { name, parent_id: parentId });
        this.displayFolderInUI(folder);
    }

    async renameFolder(folderId, newName) {
        await this.apiService.post(`/rename_folder/${folderId}`, { name: newName });
        const folderElement = document.querySelector(`.tree-item[data-id="${folderId}"]`);
        if (folderElement) {
            folderElement.querySelector(".item-name").textContent = newName;
        }
    }

    async deleteFolder(folderId) {
        const confirmation = confirm("Are you sure you want to delete this folder and its contents?");
        if (!confirmation) return;

        await this.apiService.post(`/delete_folder/${folderId}`);
        const folderElement = document.querySelector(`.tree-item[data-id="${folderId}"]`);
        if (folderElement) {
            folderElement.remove();
        }
    }

    async moveFolder(folderId, targetFolderId) {
        await this.apiService.post(`/move_folder/${folderId}`, { parent_id: targetFolderId });
        // Update UI: move folder DOM element
        const folderElement = document.querySelector(`.tree-item[data-id="${folderId}"]`);
        const targetFolderElement = document.querySelector(`.tree-item[data-id="${targetFolderId}"]`);
        if (folderElement && targetFolderElement) {
            targetFolderElement.appendChild(folderElement);
        }
    }

}

export function displayFolderInUI(folder) {
    const treeContainer = document.getElementById('tree-container');
    const folderItem = document.createElement('div');
    folderItem.classList.add('tree-item');
    folderItem.dataset.id = folder.id;
    folderItem.dataset.type = 'folder';
    folderItem.textContent = folder.name;
    treeContainer.appendChild(folderItem);
}

