import axios from 'axios';
import {UserConfig} from '../interfaces/UserConfig';

export class Gitlab {

    constructor(private config) {
    }

    authenticate() {
        return axios.create({
            baseURL: `${this.config.baseUrl}`,
            timeout: 1000,
            headers: {Authorization: `Bearer ${this.config.token}`},
            responseType: 'json'
        });
    }

    private async initRemoteConfigFile() {
        try {
            await this.authenticate().post(
                `${this.config.baseUrl}/api/v4/projects/${this.config.projectId}/repository/files/${this.config.configFileName}`,
                {
                    "branch": this.config.branch,
                    "content": "{}",
                    "commit_message": `Init new config file ${this.config.configFileName}`
                }
            );
        } catch (e) {
            console.error(e.response);
            throw 'Creating a new file via GitLab API failed.'
        }
    }

    async createRemoteBranchFromCurrent(branchName) {
        try {
            if (await this.branchExists(branchName) === false) {
                await this.authenticate().post(
                    `${this.config.baseUrl}/api/v4/projects/${this.config.projectId}/repository/branches?branch=${branchName}&ref=master`,
                );
            }
        } catch (e) {
            console.error(e.response);
            throw 'Creating a new branch via GitLab API failed.'
        }
    }

    async createRemoteUserBranch() {
        try {
            const branchName = await this.getCurrentUser() + "_collection_updates";
            if (await this.branchExists(branchName) === false) {
                await this.authenticate().post(
                    `${this.config.baseUrl}/api/v4/projects/${this.config.projectId}/repository/branches?branch=${branchName}&ref=master`,
                );
            }

            return branchName;

        } catch (e) {
            console.error(e.response);
            throw 'Creating a new branch via GitLab API failed.'
        }
    }

    async branchExists(branchName) {
        try {
            await this.authenticate().get(
                `${this.config.baseUrl}/api/v4/projects/${this.config.projectId}/repository/branches/${branchName}`,
            );

            return true;
        } catch (e) {
            return false;
        }
    }

    async fetchBranches() {
        if (!this.config?.baseUrl || !this.config?.projectId || !this.config?.token) {
            return [];
        }
        try {
            const response = await this.authenticate().get(
                `${this.config.baseUrl}/api/v4/projects/${this.config.projectId}/repository/branches`
            );

            const branches = response.data.map((o) => o.name);

            return branches;
        } catch (e) {
            console.error(e);
            throw 'Fetching the projects branches via GitLab API failed.'
        }
    }

    async fetchLastTag() {
        if (!this.config?.baseUrl || !this.config?.projectId || !this.config?.token) {
            return [];
        }
        try {
            const response = await this.authenticate().get(
                `${this.config.baseUrl}/api/v4/projects/${this.config.projectId}/repository/tags`
            );

            return response.data[0];

        } catch (e) {
            console.error(e);
            throw 'Fetching the projects tags via GitLab API failed.'
        }
    }

    async pullWorkspace(tag) {
        try {
            const response = await this.authenticate().get(
                `${this.config.baseUrl}/api/v4/projects/${this.config.projectId}/repository/files/${this.config.configFileName}/raw?ref=${tag}`
            );

            return (response.data);
        } catch (e) {
            console.error(e);
            throw 'Fetching the workspace via GitLab API failed.'
        }
    }

    async createMergeRequest(mergeRequestTitle) {
        try {
            const response = await this.authenticate().post(
                `${this.config.baseUrl}/api/v4/projects/${this.config.projectId}/merge_requests`,
                {
                    "source_branch": await this.getCurrentUser() + "_collection_updates",
                    "target_branch": "master",
                    "title": mergeRequestTitle,
                    "remove_source_branch": true,
                    "squash": true
                }
            );

            return (response.data.iid);
        } catch (e) {
            console.error(e);
            throw 'Creating merge request via Gitlab API failed.'
        }
    }

    async isMergeRequestOpen() {
        try {
            if (this.config.mergeRequestId !== null) {
                const response = await this.authenticate().get(
                    `${this.config.baseUrl}/api/v4/projects/${this.config.projectId}/merge_requests/${this.config.mergeRequestId}`,
                );

                return response.data.state === "opened"
            }

            return false;
        } catch (e) {
            console.error(e);
        }
    }

    async getCurrentUser() {
        if (localStorage.getItem('insomnia-plugin-scalefast-sync.userId') === null) {
            try {
                const response = await this.authenticate().get(
                    `${this.config.baseUrl}/api/v4/user`
                );

                localStorage.setItem('insomnia-plugin-scalefast-sync.userId', response.data.username);

            } catch (e) {
                console.error(e);
                throw 'Unable to retrieve current user for given token via Gitlab API.'
            }

        }

        return localStorage.getItem('insomnia-plugin-scalefast-sync.userId');

    }

    async pushWorkspace(content, messageCommit) {
        try {
            const branchName = await this.createRemoteUserBranch();
            await this.authenticate().post(
                `${this.config.baseUrl}/api/v4/projects/${this.config.projectId}/repository/commits`,
                {
                    "branch": branchName,
                    "commit_message": messageCommit,
                    "actions": [
                        {
                            "action": "update",
                            "file_path": this.config.configFileName,
                            "content": content
                        }
                    ]
                },
            );
        } catch (e) {
            if (e.response.data.message === "A file with this name doesn't exist") {
                await this.initRemoteConfigFile()
                await this.authenticate().post(
                    `${this.config.baseUrl}/api/v4/projects/${this.config.projectId}/repository/commits`,
                    {
                        "branch": this.config.branch,
                        "commit_message": messageCommit,
                        "actions": [
                            {
                                "action": "update",
                                "file_path": this.config.configFileName,
                                "content": content
                            }
                        ]
                    },
                );
            } else {
                console.error("response:", e.response);
                throw 'Pushing the workspace via GitLab API failed.'
            }
        }
    }
}
