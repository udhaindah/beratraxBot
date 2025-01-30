import axios from 'axios';
import log from "./utils/logger.js";
import iniBapakBudi from "./utils/banner.js";
import {
    delay,
    newAgent,
    readWallets,
    solveCaptcha,
    askQuestion
} from './utils/helper.js';

async function claimTokens(address, proxy, type, apiKey, useCaptcha = false, retries = 3) {
    const agent = newAgent(proxy);
    const url = `https://www.faucet.kodiak.finance/api/claim`;
    const data = { address };
    const captcha = useCaptcha ? await solveCaptcha(apiKey, type) : '';
    
    log.info(`Trying to claim faucet for address ${address}...`);
    
    try {
        const response = await axios.post(url, data, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${captcha}`
            },
            httpsAgent: agent
        });
        
        log.info("Claim Faucet Result:", response.data);
        return response.data;
    } catch (error) {
        if (error.response?.status === 429) {
            log.warn(`Rate limited. Try again later or use a proxy.`);
            return 'claimed';
        } else {
            log.error(`Error claiming Faucets, Retry Left ${retries}`, error.response?.statusText || error.message);
            await delay(2);
            if (retries > 0) return await claimTokens(address, proxy, type, apiKey, useCaptcha, retries - 1);
            else return null;
        }
    }
}

async function main() {
    log.info(iniBapakBudi);
    await delay(3);

    const type = await askQuestion("What Captcha Solver you want to use [1. 2Captcha, 2. AntiCaptcha, 3. CapMonster] input (1-3): ");
    if (!["1", "2", "3"].includes(type)) {
        log.error("Invalid captcha solver type, please enter number: 1-3");
        return;
    }

    const apiKey = await askQuestion("Enter Your API Key: ");
    if (!apiKey) {
        log.error("Invalid API Key");
        return;
    }

    const wallets = await readWallets();
    if (wallets.length === 0) {
        log.error("No wallets found - please create wallets first.");
        return;
    }

    log.info(`Starting Faucet Claims...`);
    for (const wallet of wallets) {
        const { address } = wallet;
        try {
            log.info(`Processing Wallet ${address}...`);
            await claimTokens(address, null, type, apiKey, true);
        } catch (error) {
            log.error("Error processing wallet:", error.message);
        }
    }
    log.info(`All wallets processed. Waiting 8 hours before next run...`);
    await delay(8 * 60 * 60);
    main();
}

main();
