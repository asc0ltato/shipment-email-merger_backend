import { Sequelize, DataTypes, Model, Optional } from 'sequelize';
import { IEmailAttachment } from './attachment.interface';

interface AttachmentCreationAttributes extends Optional<IEmailAttachment, 'content' | 'contentType' | 'size'> {}

export class AttachmentModel extends Model<IEmailAttachment, AttachmentCreationAttributes> implements IEmailAttachment {
    public id!: string;
    public emailId!: string;
    public filename!: string;
    public content?: Buffer;
    public contentType?: string;
    public size?: number;
}

export const initAttachmentModel = (sequelize: Sequelize): typeof AttachmentModel => {
    AttachmentModel.init({
        id: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
        },
        emailId: {
            type: DataTypes.STRING,
            allowNull: false,
            references: {
                model: 'emails',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        filename: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        content: {
            type: DataTypes.BLOB('long'),
            allowNull: true,
        },
        contentType: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        size: {
            type: DataTypes.INTEGER,
            allowNull: true,
        }
    }, {
        sequelize,
        tableName: 'attachments',
        timestamps: true, 
    });

    return AttachmentModel;
};