import React, { MutableRefObject } from 'react';
import { Attachment, Message } from 'proton-shared/lib/interfaces/mail/Message';
import { MailSettings } from 'proton-shared/lib/interfaces';
import { waitFor } from '@testing-library/dom';
import { act } from '@testing-library/react';
import { MIME_TYPES } from 'proton-shared/lib/constants';
import { noop } from 'proton-shared/lib/helpers/function';
import loudRejection from 'loud-rejection';
import {
    render,
    clearAll,
    addApiMock,
    generateKeys,
    addKeysToAddressKeysCache,
    encryptMessage,
    GeneratedKey,
    api,
    attachmentsCache,
    addApiKeys,
    addKeysToUserKeysCache,
    addApiResolver,
    messageCache,
} from '../../helpers/test/helper';
import MessageView, { MessageViewRef } from './MessageView';
import { Breakpoints } from '../../models/utils';
import * as messageDecrypt from '../../helpers/message/messageDecrypt';
import { constructMime } from '../../helpers/send/sendMimeBuilder';
import { parseInDiv } from '../../helpers/dom';
import { X_PM_HEADERS } from '../../models/crypto';
import { addApiContact } from '../../helpers/test/contact';
import { MessageExtended } from '../../models/message';

loudRejection();

jest.setTimeout(20000);

const localID = 'localID';
const labelID = 'labelID';
const messageID = 'messageID';
const addressID = 'addressID';
const subject = 'Test subject';
const body = 'Test body';

type MessageViewProps = Parameters<typeof MessageView>[0];

const defaultProps: MessageViewProps = {
    labelID,
    conversationMode: true,
    loading: false,
    labels: [],
    message: { ID: messageID } as Message,
    mailSettings: {} as MailSettings,
    onBack: jest.fn(),
    onCompose: jest.fn(),
    breakpoints: {} as Breakpoints,
    onFocus: noop,
};

const setup = async (specificProps: Partial<MessageViewProps> = {}) => {
    const props = { ...defaultProps, ...specificProps };

    const ref = { current: null } as MutableRefObject<MessageViewRef | null>;
    const refCallback = (refValue: MessageViewRef) => {
        ref.current = refValue;
    };

    const renderResult = await render(<MessageView ref={refCallback} {...props} />);

    const open = async () => {
        jest.spyOn(messageDecrypt, 'decryptMessage');

        void (await act(async () => {
            ref.current?.expand();
            // Message decryption can take a bit of time and can be on another thread than the test
            // By waiting on the completion of the decryption, we ensure not to continue too early
            await waitFor(() => expect(messageDecrypt.decryptMessage).toHaveBeenCalled());
        }));
    };

    return { ...renderResult, ref, open };
};

describe('MessageView', () => {
    const toAddress = 'me@home.net';
    const fromAddress = 'someone@somewhere.net';
    const otherAddress = 'other@somewhere.net';

    let toKeys: GeneratedKey;
    let fromKeys: GeneratedKey;
    let otherKeys: GeneratedKey;

    beforeAll(async () => {
        toKeys = await generateKeys('me', toAddress);
        fromKeys = await generateKeys('someone', fromAddress);
        otherKeys = await generateKeys('other', otherAddress);
    });

    afterEach(clearAll);

    describe('Decrypt and render', () => {
        it('html', async () => {
            addKeysToAddressKeysCache(addressID, toKeys);

            const encryptedBody = await encryptMessage(body, fromKeys, toKeys);

            addApiMock(`mail/v4/messages/${messageID}`, () => ({
                Message: {
                    ID: messageID,
                    AddressID: addressID,
                    Subject: subject,
                    Body: encryptedBody,
                    MIMEType: MIME_TYPES.DEFAULT,
                    Attachments: [] as Attachment[],
                } as Message,
            }));

            const { open, findByText } = await setup();

            await open();

            await findByText(body);
        });

        it('plaintext', async () => {
            addKeysToAddressKeysCache(addressID, toKeys);

            const encryptedBody = await encryptMessage(body, fromKeys, toKeys);

            addApiMock(`mail/v4/messages/${messageID}`, () => ({
                Message: {
                    ID: messageID,
                    AddressID: addressID,
                    Subject: subject,
                    Body: encryptedBody,
                    MIMEType: MIME_TYPES.PLAINTEXT,
                    Attachments: [] as Attachment[],
                } as Message,
            }));

            const { open, findByText } = await setup();

            await open();

            await findByText(body);
        });

        it('multipart/mixed html', async () => {
            const message = {
                ID: messageID,
                AddressID: addressID,
                Subject: subject,
                MIMEType: MIME_TYPES.MIME,
                Attachments: [] as Attachment[],
            } as Message;

            addKeysToAddressKeysCache(addressID, toKeys);

            const mimeBody = await constructMime(
                { localID, data: message, document: parseInDiv(body) },
                toKeys,
                attachmentsCache,
                api,
                false
            );

            const encryptedBody = await encryptMessage(mimeBody, fromKeys, toKeys);

            addApiMock(`mail/v4/messages/${messageID}`, () => ({
                Message: { ...message, Body: encryptedBody },
            }));

            const { open, findByText } = await setup();

            await open();

            await findByText(body);
        });

        it('multipart/mixed plaintext', async () => {
            const message = {
                ID: messageID,
                AddressID: addressID,
                Subject: subject,
                MIMEType: MIME_TYPES.MIME,
                Attachments: [] as Attachment[],
            } as Message;

            addKeysToAddressKeysCache(addressID, toKeys);

            const mimeBody = await constructMime(
                { localID, data: { ...message, MIMEType: MIME_TYPES.PLAINTEXT }, plainText: body },
                toKeys,
                attachmentsCache,
                api,
                false
            );

            const encryptedBody = await encryptMessage(mimeBody, fromKeys, toKeys);

            addApiMock(`mail/v4/messages/${messageID}`, () => ({
                Message: { ...message, Body: encryptedBody },
            }));

            const { open, findByText } = await setup();

            await open();

            await findByText(body);
        });
    });

    describe('Message display modes', () => {
        it('loading mode', async () => {
            addApiResolver(`mail/v4/messages/${messageID}`);

            const { ref, getByTestId } = await setup();

            const messageView = getByTestId('message-view');
            messageView.scrollIntoView = jest.fn();

            act(() => ref.current?.expand());

            const placeholders = messageView.querySelectorAll('.message-content-loading-placeholder');

            expect(placeholders.length).toBeGreaterThanOrEqual(3);
        });

        it('encrypted mode', async () => {
            const encryptedBody = 'body-test';

            messageCache.set(messageID, {
                localID: messageID,
                data: { Body: encryptedBody, Subject: 'test' },
                errors: { decryption: [new Error('test')] },
                initialized: true,
                verification: {},
            } as MessageExtended);

            const { getByTestId } = await setup({ conversationMode: false });

            const errorsBanner = getByTestId('errors-banner');
            expect(errorsBanner.textContent).toContain('Decryption error');

            const messageView = getByTestId('message-view');
            expect(messageView.textContent).toContain(encryptedBody);
        });

        it('source mode on processing error', async () => {
            const decryptedBody = 'decrypted-test';

            messageCache.set(messageID, {
                localID: messageID,
                data: { Body: 'test', Subject: 'test' },
                errors: { processing: [new Error('test')] },
                initialized: true,
                verification: {},
                decryptedBody,
            } as MessageExtended);

            const { getByTestId } = await setup({ conversationMode: false });

            const errorsBanner = getByTestId('errors-banner');
            expect(errorsBanner.textContent).toContain('processing error');

            const messageView = getByTestId('message-view');
            expect(messageView.textContent).toContain(decryptedBody);
        });
    });

    describe('Signature verification', () => {
        it('verified sender internal', async () => {
            addKeysToAddressKeysCache(addressID, toKeys);
            addKeysToUserKeysCache(toKeys);
            addApiKeys(true, fromAddress, [fromKeys]);
            addApiContact({ contactID: 'contactID', email: fromAddress, pinKey: fromKeys }, toKeys);

            const encryptedBody = await encryptMessage(body, fromKeys, toKeys);

            addApiMock(`mail/v4/messages/${messageID}`, () => ({
                Message: {
                    ID: messageID,
                    AddressID: addressID,
                    Sender: {
                        Address: fromAddress,
                    },
                    Subject: subject,
                    Body: encryptedBody,
                    MIMEType: MIME_TYPES.DEFAULT,
                    Attachments: [] as Attachment[],
                    ParsedHeaders: {
                        'X-Pm-Origin': X_PM_HEADERS.INTERNAL,
                        'X-Pm-Content-Encryption': X_PM_HEADERS.END_TO_END,
                    } as any,
                    Time: new Date().getTime(),
                } as Message,
            }));

            const { open, findByTestId } = await setup();

            await open();

            const icon = await findByTestId('encryption-icon');

            expect(icon.classList.contains('color-info')).toBe(true);
            expect((icon.firstChild as Element).getAttribute('xlink:href')).toBe('#shape-locks-check');
        });

        it('verified sender external', async () => {
            addKeysToAddressKeysCache(addressID, toKeys);
            addKeysToUserKeysCache(toKeys);
            addApiKeys(false, fromAddress, [fromKeys]);
            addApiContact({ contactID: 'contactID', email: fromAddress, pinKey: fromKeys }, toKeys);

            const message = {
                ID: messageID,
                AddressID: addressID,
                Sender: {
                    Address: fromAddress,
                },
                Subject: subject,
                MIMEType: MIME_TYPES.DEFAULT,
                Attachments: [] as Attachment[],
                ParsedHeaders: {
                    'X-Pm-Origin': X_PM_HEADERS.EXTERNAL,
                    'X-Pm-Content-Encryption': X_PM_HEADERS.END_TO_END,
                } as any,
                Time: new Date().getTime(),
            } as Message;

            const mimeBody = await constructMime(
                { localID, data: message, document: parseInDiv(body) },
                toKeys,
                attachmentsCache,
                api,
                false
            );

            const encryptedBody = await encryptMessage(mimeBody, fromKeys, toKeys);

            addApiMock(`mail/v4/messages/${messageID}`, () => ({
                Message: { ...message, Body: encryptedBody },
            }));

            const { open, findByTestId } = await setup();

            await open();

            const icon = await findByTestId('encryption-icon');

            expect(icon.classList.contains('color-success')).toBe(true);
            expect((icon.firstChild as Element).getAttribute('xlink:href')).toBe('#shape-locks-check');
        });

        it('signature verification error', async () => {
            addKeysToAddressKeysCache(addressID, toKeys);
            addKeysToUserKeysCache(toKeys);
            addApiKeys(true, fromAddress, []);
            addApiContact({ contactID: 'contactID', email: fromAddress, pinKey: otherKeys }, toKeys);

            const encryptedBody = await encryptMessage(body, fromKeys, toKeys);

            addApiMock(`mail/v4/messages/${messageID}`, () => ({
                Message: {
                    ID: messageID,
                    AddressID: addressID,
                    Sender: {
                        Address: fromAddress,
                    },
                    Subject: subject,
                    Body: encryptedBody,
                    MIMEType: MIME_TYPES.DEFAULT,
                    Attachments: [] as Attachment[],
                    ParsedHeaders: {
                        'X-Pm-Origin': X_PM_HEADERS.INTERNAL,
                        'X-Pm-Content-Encryption': X_PM_HEADERS.END_TO_END,
                    } as any,
                    Time: new Date().getTime(),
                } as Message,
            }));

            const { open, findByTestId } = await setup();

            await open();

            const icon = await findByTestId('encryption-icon');

            expect(icon.classList.contains('color-info')).toBe(true);
            expect((icon.firstChild as Element).getAttribute('xlink:href')).toBe('#shape-locks-warning');
        });

        // TODO
        // describe('Trust key banner', () => {
        //     it('AUTOPROMPT', async () => {});
        //     it('PIN_UNSEEN', async () => {});
        //     it('PIN_ATTACHED_SIGNING mode', async () => {});
        //     it('PIN_ATTACHED mode', async () => {});
        // });
    });
});
