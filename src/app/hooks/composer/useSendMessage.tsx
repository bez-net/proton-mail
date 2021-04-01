import { SendPreferences } from 'proton-shared/lib/interfaces/mail/crypto';
import { Message } from 'proton-shared/lib/interfaces/mail/Message';
import { SimpleMap } from 'proton-shared/lib/interfaces/utils';
import { getRecipientsAddresses } from 'proton-shared/lib/mail/messages';
import { useCallback } from 'react';
import { useHistory } from 'react-router';
import { c } from 'ttag';
import { unique } from 'proton-shared/lib/helpers/array';
import { sendMessage, cancelSend } from 'proton-shared/lib/api/messages';
import { useApi, useEventManager, useNotifications } from 'react-components';
import { wait } from 'proton-shared/lib/helpers/promise';
import { MessageExtendedWithData } from '../../models/message';
import { generateTopPackages } from '../../helpers/send/sendTopPackages';
import { attachSubPackages } from '../../helpers/send/sendSubPackages';
import { encryptPackages } from '../../helpers/send/sendEncrypt';
import { useAttachmentCache } from '../../containers/AttachmentProvider';
import { updateMessageCache, useMessageCache } from '../../containers/MessageProvider';
import { useSaveDraft } from '../message/useSaveDraft';
import { SendingMessageNotificationManager } from '../../components/notifications/SendingMessageNotification';
import { OnCompose } from './useCompose';
import useDelaySendSeconds from '../useDelaySendSeconds';
import { useGetMessageKeys } from '../message/useGetMessageKeys';
import { getParamsFromPathname, setParamsInLocation } from '../../helpers/mailboxUrl';
import { useSendMoficiations } from './useSendModifications';

const DELAY_SEND_PROCESSING = 5000;
const MIN_DELAY_SENT_NOTIFICATION = 2500;

// Reference: Angular/src/app/composer/services/sendMessage.js

export const useSendMessage = () => {
    const api = useApi();
    const getMessageKeys = useGetMessageKeys();
    const attachmentCache = useAttachmentCache();
    const { call } = useEventManager();
    const messageCache = useMessageCache();
    const saveDraft = useSaveDraft();
    const history = useHistory<any>();
    const delaySendSeconds = useDelaySendSeconds();
    const { createNotification, hideNotification } = useNotifications();
    const sendModification = useSendMoficiations();

    return useCallback(
        async (
            inputMessage: MessageExtendedWithData,
            mapSendPrefs: SimpleMap<SendPreferences>,
            onCompose: OnCompose,
            alreadySaved = false,
            sendingMessageNotificationManager?: SendingMessageNotificationManager
        ) => {
            const { localID, data } = inputMessage;
            const hasUndo = !!delaySendSeconds;

            const handleUndo = async () => {
                if (sendingMessageNotificationManager) {
                    hideNotification(sendingMessageNotificationManager.ID);
                }
                const savedMessage = messageCache.get(localID) as MessageExtendedWithData;
                await api(cancelSend(savedMessage.data.ID));
                createNotification({ text: c('Message notification').t`Sending undone` });
                await call();
                // Re-open draft
                onCompose({
                    existingDraft: {
                        localID,
                        data,
                    },
                });
            };

            const prepareMessageToSend = async () => {
                if (!alreadySaved) {
                    await saveDraft(inputMessage);
                }

                const messageKeys = await getMessageKeys(inputMessage.data);

                // Last minute modifications on the message before sending
                const message = (await sendModification(inputMessage)) as MessageExtendedWithData;

                // TODO: handleAttachmentSigs ?

                const emails = unique(getRecipientsAddresses(inputMessage.data));

                let packages = await generateTopPackages(message, messageKeys, mapSendPrefs, attachmentCache, api);
                packages = await attachSubPackages(packages, message, emails, mapSendPrefs, api);
                packages = await encryptPackages(message, messageKeys, packages);

                // expiresIn is not saved on the API and then empty in `message`, we need to refer to `inputMessage`
                const { expiresIn } = inputMessage;
                return api<{ Sent: Message; DeliveryTime: number }>(
                    sendMessage(message.data?.ID, {
                        Packages: packages,
                        ExpiresIn: expiresIn === 0 ? undefined : expiresIn,
                        DelaySeconds: delaySendSeconds, // Once the API receive this request, it calculates how much time the notification needs to be display
                    } as any)
                );
            };

            const promise = prepareMessageToSend().then((result) => {
                const delta = result.DeliveryTime * 1000 - Date.now();
                const undoTimeout = delta > 0 ? delta : 0;
                return { ...result, undoTimeout };
            });

            sendingMessageNotificationManager?.setProperties(promise, handleUndo);

            try {
                const currentMessage = messageCache.get(localID) as MessageExtendedWithData;
                updateMessageCache(messageCache, localID, {
                    ...currentMessage,
                    sending: true,
                });
                const { Sent, undoTimeout } = await promise;
                const endSending = async () => {
                    await wait(Math.max(undoTimeout, MIN_DELAY_SENT_NOTIFICATION));
                    if (sendingMessageNotificationManager) {
                        hideNotification(sendingMessageNotificationManager.ID);
                    }
                    if (hasUndo) {
                        await wait(DELAY_SEND_PROCESSING);
                        await call();
                    }
                };

                void endSending();

                updateMessageCache(messageCache, localID, {
                    data: Sent,
                    initialized: undefined,
                    showEmbeddedImages: undefined,
                });

                // Navigation to the sent message
                const {
                    params: { labelID, elementID },
                } = getParamsFromPathname(history.location.pathname);
                if (elementID === Sent.ConversationID) {
                    history.push(
                        setParamsInLocation(history.location, {
                            labelID,
                            elementID: Sent.ConversationID,
                            messageID: Sent.ID,
                        })
                    );
                }
            } catch (error) {
                onCompose({
                    existingDraft: {
                        localID,
                        data,
                    },
                });
                throw error;
            } finally {
                const currentMessage = messageCache.get(localID) as MessageExtendedWithData;
                updateMessageCache(messageCache, localID, {
                    ...currentMessage,
                    sending: false,
                });
                void call();
            }
        },
        [delaySendSeconds, messageCache, attachmentCache, saveDraft]
    );
};
