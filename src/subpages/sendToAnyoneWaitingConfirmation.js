import template from "./sendToAnyoneWaitingConfirmation.mpts";
import close from "!!url-loader!../img/close.svg"
import twitter from "!!url-loader!../img/twitter.svg"
import {create} from "fast-creator";

export class SendToAnyoneWaitingConfirmation {
    constructor(identifier, amountUSD, token, amountToken, assetId, assetType) {
        this.html = create('div', {}, template({identifier, close, twitter, amountUSD, amountToken, assetId, token}));
        const subtitleCoin = this.html.querySelector('.subtitleCoin')
        const subtitleToken = this.html.querySelector('.subtitleToken')
        const subtitleNFT = this.html.querySelector('.subtitleNFT')
        subtitleToken.style.display = 'none'
        subtitleCoin.style.display = 'none'
        subtitleNFT.style.display = 'none'

        if (assetType === 'erc20') {
            subtitleToken.style.display = ''
        } else if (assetType === 'erc721') {
            subtitleNFT.style.display = ''
        } else {
            subtitleCoin.style.display = ''
        }

        this.html.querySelector('.closeButton').onclick = () => this.html.dispatchEvent(Object.assign(new Event('close', {bubbles: true})));
    }
}