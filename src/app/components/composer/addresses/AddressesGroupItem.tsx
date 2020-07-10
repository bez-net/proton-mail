import React, { useState } from 'react';
import { c } from 'ttag';
import { Icon, useModals } from 'react-components';

import { ContactEmail } from 'proton-shared/lib/interfaces/contacts';
import AddressesGroupModal from './AddressesGroupModal';
import { getRecipientGroupLabel } from '../../../helpers/addresses';
import { RecipientGroup } from '../../../models/address';
import { getContactsOfGroup } from '../../../helpers/contacts';
import { useUpdateGroupSendInfo, MessageSendInfo } from '../../../hooks/useSendInfo';

interface Props {
    recipientGroup: RecipientGroup;
    contacts: ContactEmail[];
    messageSendInfo?: MessageSendInfo;
    onChange: (value: RecipientGroup) => void;
    onRemove: () => void;
}

const AddressesGroupItem = ({ recipientGroup, contacts, messageSendInfo, onChange, onRemove }: Props) => {
    const { createModal, getModal, hideModal, removeModal } = useModals();
    const [modalID, setModalID] = useState();

    const contactsInGroup = getContactsOfGroup(contacts, recipientGroup?.group?.ID);
    const label = getRecipientGroupLabel(recipientGroup, contactsInGroup.length);

    const { handleRemove } = useUpdateGroupSendInfo(messageSendInfo, contactsInGroup, onRemove);

    const handleOpenGroupModal = () => {
        setModalID(createModal());
    };
    const handleCloseGroupModal = () => {
        hideModal(modalID);
    };
    const handleRemoveGroupModal = () => {
        removeModal(modalID);
        setModalID(undefined);
    };

    return (
        <>
            <div className="composer-addresses-item mt0-25 mb0-25 mr0-5 bordered-container flex flex-nowrap flex-row mw100 stop-propagation">
                <span className="inline-flex composer-addresses-item-icon pl0-5 pr0-5 no-pointer-events-children h100">
                    <Icon name="contacts-groups" size={12} color={recipientGroup?.group?.Color} className="mauto" />
                </span>
                <span
                    className="composer-addresses-item-label mtauto mbauto pl0-5 ellipsis pr0-5"
                    onClick={handleOpenGroupModal}
                >
                    {label}
                </span>
                <button
                    type="button"
                    className="composer-addresses-item-remove inline-flex pl0-5 pr0-5 no-pointer-events-children h100"
                    onClick={handleRemove}
                    title={c('Action').t`Remove`}
                >
                    <Icon name="off" size={12} className="mauto" />
                    <span className="sr-only">{c('Action').t`Remove`}</span>
                </button>
            </div>
            {modalID && (
                <AddressesGroupModal
                    recipientGroup={recipientGroup}
                    contacts={contactsInGroup}
                    messageSendInfo={messageSendInfo}
                    onSubmit={onChange}
                    onClose={handleCloseGroupModal}
                    onExit={handleRemoveGroupModal}
                    {...getModal(modalID)}
                />
            )}
        </>
    );
};

export default AddressesGroupItem;
