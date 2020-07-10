import { EncryptionPreferences } from 'proton-shared/lib/mail/encryptionPreferences';
import { SendPreferences } from '../../models/crypto';
import { Message } from '../../models/message';
import { isEO, isSign } from './messages';
import { getPGPSchemeAndMimeType } from './sendPreferences';

/**
 * Get the send preferences for sending a message based on the encryption preferences
 * for sending to an email address, and the message preferences.
 */
const getSendPreferences = (encryptionPreferences: EncryptionPreferences, message?: Message): SendPreferences => {
    const {
        encrypt,
        sign,
        sendKey,
        isSendKeyPinned,
        hasApiKeys,
        hasPinnedKeys,
        warnings,
        failure
    } = encryptionPreferences;
    const isEncryptedToOutside = isEO(message);
    // override encrypt if necessary
    const newEncrypt = encrypt || isEncryptedToOutside;
    // override sign if necessary
    // (i.e. when the contact sign preference is false and the user toggles "Sign" on the composer)
    const newSign = isEncryptedToOutside ? false : sign || isSign(message);
    // cast PGP scheme into what API expects. Override if necessary
    const { pgpScheme, mimeType } = getPGPSchemeAndMimeType({ ...encryptionPreferences, sign: newSign }, message);

    return {
        encrypt: newEncrypt,
        sign: newSign,
        pgpScheme,
        mimeType,
        publicKeys: sendKey ? [sendKey] : undefined,
        isPublicKeyPinned: isSendKeyPinned,
        hasApiKeys,
        hasPinnedKeys,
        warnings,
        failure
    };
};

export default getSendPreferences;
