import React from 'react';
import { c } from 'ttag';
import { Icon, Tooltip, classnames } from 'react-components';
import { MessageExtended } from '../../models/message';

interface ButtonProps {
    onClick: () => void;
    iconName: string;
    className?: string;
    title?: string;
}

const TitleBarButton = ({ onClick, iconName, className = '', title }: ButtonProps) => {
    return (
        <Tooltip title={title} className="composer-title-bar-tooltip flex-item-noshrink flex">
            <button
                type="button"
                className={classnames(['composer-title-bar-button flex p0-5', className])}
                onClick={onClick}
            >
                <Icon className="mauto" name={iconName} />
                <span className="sr-only">{title}</span>
            </button>
        </Tooltip>
    );
};

interface Props {
    message: MessageExtended;
    minimized: boolean;
    maximized: boolean;
    toggleMinimized: () => void;
    toggleMaximized: () => void;
    onClose: () => void;
}

const ComposerTitleBar = ({ message, minimized, maximized, toggleMinimized, toggleMaximized, onClose }: Props) => {
    const title = message.data?.Subject || c('Title').t`New message`;

    return (
        <header className="composer-title-bar flex flex-row flex-items-center flex-nowrap pl0-5 pr0-5 w100 color-global-light">
            <span className="flex-item-fluid p0-5 pr1 ellipsis">{title}</span>
            <TitleBarButton
                iconName="minimize"
                className={classnames([minimized && 'rotateX-180'])}
                title={minimized ? c('Action').t`Maximize composer` : c('Action').t`Minimize composer`}
                onClick={toggleMinimized}
            />
            <TitleBarButton
                iconName={maximized ? 'contract-window' : 'expand'}
                title={maximized ? c('Action').t`Contract composer` : c('Action').t`Expand composer`}
                onClick={toggleMaximized}
            />
            <TitleBarButton iconName="close" title={c('Action').t`Close composer`} onClick={onClose} />
        </header>
    );
};

export default ComposerTitleBar;
