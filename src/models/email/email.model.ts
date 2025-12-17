import { Sequelize, DataTypes, Model, Optional } from 'sequelize';
import { IEmail } from './email.interface';

interface EmailGroupCreationAttributes extends Optional<IEmail, 'text' | 'status'> {}

export class EmailModel extends Model<IEmail, EmailGroupCreationAttributes> implements IEmail {
    public id!: string;
    public from!: string;
    public to!: string;
    public subject!: string;
    public date!: Date;
    public emailGroupId!: string;
    public status!: 'not_processed' | 'processing' | 'processed' | 'failed';
    public text?: string;
}

export const initEmailModel = (sequelize: Sequelize): typeof EmailModel => {
    EmailModel.init({
        id: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
        },
        from: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        to: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        subject: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        date: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        emailGroupId: {
            type: DataTypes.STRING,
            allowNull: false,
            references: {
                model: 'email_groups',
                key: 'emailGroupId'
            },
            onDelete: 'CASCADE'
        },
        status: {
            type: DataTypes.ENUM('not_processed', 'processing', 'processed', 'failed'),
            allowNull: false,
            defaultValue: 'not_processed'
        },
        text: {
            type: DataTypes.TEXT('long'),
            allowNull: true,
        }
    }, {
        sequelize,
        tableName: 'emails',
        timestamps: false,
        indexes: [
            { fields: ['date'] },
            { fields: ['status'] }
        ]
    });

    return EmailModel;
};