import { Sequelize, DataTypes, Model } from 'sequelize';

export interface IUser {
    id?: number;
    email: string;
    accessToken: string;
    refreshToken?: string;
    lastSync: Date;
    isActive: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export class UserModel extends Model<IUser> implements IUser {
    public id?: number;
    public email!: string;
    public accessToken!: string;
    public refreshToken?: string;
    public lastSync!: Date;
    public isActive!: boolean;
    public createdAt?: Date;
    public updatedAt?: Date;
}

export const initUserModel = (sequelize: Sequelize): typeof UserModel => {
    UserModel.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        accessToken: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        refreshToken: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        lastSync: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        sequelize,
        tableName: 'users',
        timestamps: true,
        indexes: [
            { fields: ['email'] },
            { fields: ['lastSync'] }
        ]
    });

    return UserModel;
};