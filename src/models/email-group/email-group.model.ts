import { Sequelize, DataTypes, Model, Optional } from 'sequelize';
import { IEmailGroup } from './email-group.interface';

interface EmailGroupCreationAttributes extends Optional<IEmailGroup, 'createdAt' | 'updatedAt' | 'userId'> {}

export class EmailGroupModel extends Model<IEmailGroup, EmailGroupCreationAttributes> implements IEmailGroup {
    public emailGroupId!: string;
    public userId?: number;
    public createdAt!: Date;
    public updatedAt!: Date;
}

export const initEmailGroupModel = (sequelize: Sequelize): typeof EmailGroupModel => {
    EmailGroupModel.init({
        emailGroupId: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            },
            onDelete: 'SET NULL'
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    }, {
        sequelize,
        tableName: 'email_groups',
        timestamps: true,
        indexes: [
            { fields: ['createdAt'] },
            { fields: ['userId'] }
        ]
    });

    return EmailGroupModel;
};