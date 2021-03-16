import { queryConversations } from 'proton-shared/lib/api/conversations';
import { MESSAGE_FLAGS } from 'proton-shared/lib/mail/constants';
import { Element } from '../../../models/element';
import { Sort } from '../../../models/tools';
import { clearAll, api, addApiMock } from '../../../helpers/test/helper';
import { ELEMENTS_CACHE_REQUEST_SIZE, PAGE_SIZE } from '../../../constants';
import { getElements, labelID, setup } from './Mailbox.test.helpers';

describe('Mailbox element list', () => {
    const element1 = {
        ID: 'id1',
        Labels: [{ ID: labelID, ContextTime: 1 }],
        LabelIDs: [labelID],
        Size: 20,
        NumUnread: 1,
    } as Element;
    const element2 = {
        ID: 'id2',
        Labels: [{ ID: labelID, ContextTime: 2 }],
        LabelIDs: [labelID],
        Size: 10,
        NumUnread: 1,
    } as Element;
    const element3 = {
        ID: 'id3',
        Labels: [{ ID: 'otherLabelID', ContextTime: 3 }],
        LabelIDs: ['otherLabelID'],
        NumUnread: 0,
    } as Element;

    beforeEach(clearAll);

    describe('elements memo', () => {
        it('should order by label context time', async () => {
            const conversations = [element1, element2];
            const { getAllByTestId } = await setup({ conversations });
            const items = getAllByTestId('item');

            expect(items.length).toBe(2);
            expect(items[0].getAttribute('data-element-id')).toBe(conversations[1].ID);
            expect(items[1].getAttribute('data-element-id')).toBe(conversations[0].ID);
        });

        it('should filter message with the right label', async () => {
            const { getAllByTestId } = await setup({
                page: 0,
                total: 2,
                conversations: [element1, element2, element3],
            });
            const items = getAllByTestId('item');

            expect(items.length).toBe(2);
        });

        it('should limit to the page size', async () => {
            const total = PAGE_SIZE + 5;
            const { getAllByTestId } = await setup({ conversations: getElements(total), page: 0, total });
            const items = getAllByTestId('item');

            expect(items.length).toBe(PAGE_SIZE);
        });

        it('should returns the current page', async () => {
            const page1 = 0;
            const page2 = 1;
            const total = PAGE_SIZE + 2;
            const conversations = getElements(total);

            const { rerender, getAllByTestId } = await setup({ conversations, total, page: page1 });
            let items = getAllByTestId('item');
            expect(items.length).toBe(PAGE_SIZE);

            await rerender({ page: page2 });
            items = getAllByTestId('item');
            expect(items.length).toBe(2);
        });

        it('should returns elements sorted', async () => {
            const conversations = [element1, element2];
            const sort1: Sort = { sort: 'Size', desc: false };
            const sort2: Sort = { sort: 'Size', desc: true };

            const { rerender, getAllByTestId } = await setup({ conversations, sort: sort1 });
            let items = getAllByTestId('item');

            expect(items.length).toBe(2);
            expect(items[0].getAttribute('data-element-id')).toBe(conversations[1].ID);
            expect(items[1].getAttribute('data-element-id')).toBe(conversations[0].ID);

            await rerender({ sort: sort2 });
            items = getAllByTestId('item');

            expect(items.length).toBe(2);
            expect(items[0].getAttribute('data-element-id')).toBe(conversations[0].ID);
            expect(items[1].getAttribute('data-element-id')).toBe(conversations[1].ID);
        });
    });

    describe('request effect', () => {
        it('should send request for conversations current page', async () => {
            const page = 0;
            const total = PAGE_SIZE + 3;
            const expectedRequest = {
                ...queryConversations({
                    LabelID: labelID,
                    Sort: 'Time',
                    Limit: ELEMENTS_CACHE_REQUEST_SIZE,
                    PageSize: PAGE_SIZE,
                } as any),
                signal: new AbortController().signal,
            };

            const { getAllByTestId } = await setup({ conversations: getElements(PAGE_SIZE), page, total });

            expect(api).toHaveBeenCalledWith(expectedRequest);

            const items = getAllByTestId('item');
            expect(items.length).toBe(PAGE_SIZE);
        });
    });

    describe('filter unread', () => {
        it('should only show unread conversations if filter is on', async () => {
            const conversations = [element1, element2, element3];

            const { getAllByTestId } = await setup({ conversations, filter: { Unread: 1 } });
            const items = getAllByTestId('item');

            expect(items.length).toBe(2);
        });

        it('should keep in view the conversations when opened while filter is on', async () => {
            const conversations = [element1, element2, element3];
            const message = {
                ID: 'messageID1',
                ConversationID: element1.ID,
                Flag: MESSAGE_FLAGS.FLAG_RECEIVED,
                LabelIDs: [labelID],
            };

            const { rerender, getAllByTestId } = await setup({ conversations, filter: { Unread: 1 } });

            // A bit complex but the point is to simulate opening the conversation
            addApiMock(`mail/v4/conversations/${element1.ID}`, () => ({
                Conversation: element1,
                Messages: [message],
            }));
            addApiMock(`mail/v4/messages/messageID1`, () => message);
            addApiMock(`mail/v4/messages/read`, () => {});
            await rerender({ elementID: element1.ID });

            const items = getAllByTestId('item');
            expect(items.length).toBe(2);
            expect(items[1].classList.contains('read')).toBe(true);
            expect(items[0].classList.contains('read')).toBe(false);
        });
    });
});
