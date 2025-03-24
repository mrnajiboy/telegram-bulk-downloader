export interface ThreadQuery {
    useThread: boolean;
    threadId?: number;
}

export interface ChatQuery {
    id: string;
}

export interface MenuOption {
    option: 'new_download' | 'resume' | 'exit';
}

export interface ResumeOption {
    resume: string;
}