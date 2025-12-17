import { Sequelize, DataTypes, Model, Optional } from 'sequelize';
import { ISummary, ShipmentRequest } from './summary.interface';

interface SummaryCreationAttributes extends Optional<ISummary, 'createdAt' | 'updatedAt' | 'summary'> {}

export class SummaryModel extends Model<ISummary, SummaryCreationAttributes> implements ISummary {
    public summaryId!: string;
    public emailGroupId!: string;
    public shipment_data!: ShipmentRequest;
    public summary!: string;
    public status!: 'pending' | 'processing' | 'approved' | 'rejected' | 'failed';
    public createdAt!: Date;
    public updatedAt!: Date;
}

export const initSummaryModel = (sequelize: Sequelize): typeof SummaryModel => {
    SummaryModel.init({
        summaryId: {
            type: DataTypes.STRING,
            primaryKey: true,
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
        shipment_data: {
            type: DataTypes.JSONB,
            allowNull: false,
        },
        summary: {
            type: DataTypes.TEXT,
            allowNull: true,
            defaultValue: ''
        },
        status: {
            type: DataTypes.ENUM('pending', 'processing', 'approved', 'rejected', 'failed'),
            allowNull: false,
            defaultValue: 'pending',
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
        tableName: 'summaries',
        timestamps: true,
        indexes: [
            { fields: ['summaryId'] },
            { fields: ['emailGroupId'] },
            { fields: ['status'] },
            { fields: ['emailGroupId', 'status'] },
            { fields: ['createdAt'] }
        ]
    });

    return SummaryModel;
};