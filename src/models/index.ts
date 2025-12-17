import { Sequelize } from 'sequelize';
import { initUserModel } from './auth';
import { initSummaryModel } from './summary';
import { initEmailGroupModel } from './email-group';
import { initEmailModel } from './email';
import { initAttachmentModel } from './attachment';

export const initModels = (sequelize: Sequelize) => {
    const User = initUserModel(sequelize);
    const Summary = initSummaryModel(sequelize);
    const EmailGroup = initEmailGroupModel(sequelize);
    const Email = initEmailModel(sequelize);
    const Attachment = initAttachmentModel(sequelize);

    User.hasMany(EmailGroup, {
        foreignKey: 'userId',
        as: 'emailGroups',
        onDelete: 'CASCADE'
    });

    EmailGroup.belongsTo(User, {
        foreignKey: 'userId',
        as: 'user'
    });


    EmailGroup.hasMany(Summary, {
        foreignKey: 'emailGroupId',
        sourceKey: 'emailGroupId',
        as: 'summaries'
    });

    Summary.belongsTo(EmailGroup, {
        foreignKey: 'emailGroupId',
        targetKey: 'emailGroupId',
        as: 'emailGroupRef'
    });

    EmailGroup.hasMany(Email, {
        foreignKey: 'emailGroupId',
        sourceKey: 'emailGroupId',
        as: 'emails',
        onDelete: 'CASCADE'
    });

    Email.belongsTo(EmailGroup, {
        foreignKey: 'emailGroupId',
        targetKey: 'emailGroupId',
        as: 'emailGroup'
    });

    Email.hasMany(Attachment, {
        foreignKey: 'emailId',
        as: 'attachments',
        onDelete: 'CASCADE'
    });

    Attachment.belongsTo(Email, {
        foreignKey: 'emailId',
        as: 'email'
    });

    return { User, Summary, EmailGroup, Email, Attachment };
};

export type Models = ReturnType<typeof initModels>;