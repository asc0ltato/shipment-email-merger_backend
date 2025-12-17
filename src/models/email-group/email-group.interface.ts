import {IEmail} from "@/models/email";
import {ISummary} from "@/models/summary";

export interface IEmailGroup {
    emailGroupId: string;
    userId?: number;
    createdAt: Date;
    updatedAt: Date;
    emails?: IEmail[];
    summary?: ISummary;
    summaries?: ISummary[];
}