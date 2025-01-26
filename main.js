
import axios from 'axios';
import log from "./utils/logger.js"
import iniBapakBudi from "./utils/banner.js"
import zapAndStake from './utils/stake.js'
import {
    delay,
    newAgent,
    readFile,
    readWallets,
    solveCaptcha,
    askQuestion
} from './utils/helper.js'

async function claimTokens(address, proxy, type, apiKey, useCaptcha = false, retries = 3) {
    const agent = newAgent(proxy)
    const url = `https://bartiofaucet.berachain.com/api/claim?address=${address}`;
    const data = {
        address
    };
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
        if (error.response?.status === 402) {
            log.error(`You have to have at least 0.001 ETH on Ethereum Mainnet in your wallet to be able to use the faucet.`);
        } else if (error.response?.status === 401) {
            log.error(`You have to solve the captcha first, trying to solve captcha...`)
            return 401;
        } else if (error.response.status === 429) {
            log.warn(`You have been rate limited. use proxy if you are sure this wallet never claim faucet before.`);
            return 'claimed'
        } else {
            log.error(`Error claiming Faucets, Retry Left ${retries}`, error.response?.statusText || error.message);
            await delay(2)
            if (retries > 0) return await claimTokens(address, proxy, useCaptcha, retries - 1)
            else return null;
        }
    }
}

async function setConnector(address, proxy, retries = 3) {
    const agent = newAgent(proxy)
    const url = "https://beratrax-api-ae00332865bc.herokuapp.com/api/v1/account/set-connector";
    const data = {
        address,
        connector: "io.metamask"
    };

    try {
        const response = await axios.post(url, data, {
            httpsAgent: agent
        });
        log.info("Set connector result:", response.data);
    } catch (error) {
        log.error("Error setting connector:", error.response?.statusText || error.message);
        if (retries > 0) return await setConnector(address, proxy, retries - 1)
    }
}

async function createAccount(address, proxy, retries = 3) {
    const agent = newAgent(proxy)
    const url = "https://beratrax-api-ae00332865bc.herokuapp.com/api/v1/account";
    const data = {
        address,
        referrer: "GeognosticalBera"
    };

    try {
        const response = await axios.post(url, data, {
            httpsAgent: agent
        });
        if (response?.data?.error) return null;
        log.info("Create account result:", response.data);
    } catch (error) {
        log.error("Error creating account:", error.response?.statusText || error.message);
        if (retries > 0) return await createAccount(address, proxy, retries - 1)
    }
}

async function updateHistoryTx(address, proxy, amount, retries = 3) {
    const agent = newAgent(proxy)
    const url = "https://beratrax-api-ae00332865bc.herokuapp.com/api/v1/transaction/save-history-tx";
    const data = {
        "from": address,
        "amountInWei": amount,
        "date": new Date().toString(),
        "type": "deposit",
        "farmId": 1001,
        "max": false,
        "token": "0x0000000000000000000000000000000000000000",
        "steps": [
            {
                "status": "COMPLETED",
                "type": "Zap In",
                "amount": amount
            },
            {
                "status": "COMPLETED",
                "type": "Stake into reward vault",
                "amount": amount
            }
        ]
    }

    try {
        log.info(`Trying to update history tx for ${address}...`);
        const response = await axios.post(url, data, {
            httpsAgent: agent
        });
        if (response?.data?.error) return null;
        log.info("Update history tx result:", response.data);
    } catch (error) {
        log.error("Error Update history tx:", error.response?.statusText || error.message);
        if (retries > 0) return await updateHistoryTx(address, proxy, amount, retries - 1)
    }
}

async function main() {
    log.info(iniBapakBudi)
    await delay(3)

    const type = await askQuestion("What Captcha Solver you want to use [1. 2Captcha, 2. AntiCaptcha, 3. CapMonster] input (1-3): ")
    if (type !== '1' && type !== '2' && type !== '3') {
        log.error("Invalid captcha solver type, please enter number : 1-3 ");
        return;
    }

    const apiKey = await askQuestion("Enter Your Apikey : ");
    if (!apiKey) {
        log.error("Invalid api key");
        return;
    }

    const wallets = await readWallets();
    if (wallets.length === 0) {
        log.error("No wallets found - please create wallets first 'npm run setup'");
        return;
    }

    const proxies = await readFile('proxy.txt')
    if (proxies.length === 0) log.warn('Running without proxy...')

    while (true) {
        for (let i = 0; i < wallets.length; i++) {
            const wallet = wallets[i];
            const proxy = proxies[i % proxies.length] || null;
            const { address, privateKey } = wallet;
            try {
                log.info(`Processing Wallet ${address} with proxy:`, proxy);
                await setConnector(address, proxy);
                await createAccount(address, proxy);
                const isClaimed = await claimTokens(address, proxy);
                if (!isClaimed) continue;
                else if (isClaimed === 401) await claimTokens(address, proxy, type, apiKey, true);
                log.info(`Processing Zap In and Stake for Wallet:`, address);

                const zapAndStakeResult = await zapAndStake(privateKey, isClaimed)
                if (zapAndStakeResult) {
                    log.info(`On-Chain Result:`, zapAndStakeResult);
                    const amount = zapAndStakeResult?.balance || 0;
                    if (!amount) continue;
                    else await updateHistoryTx(address, proxy, amount);
                }
            } catch (error) {
                log.error("Error creating account and staking:", error.message);
                continue;
            }
        }
        log.info(`All wallets processed, waiting 8 hour before next run...`);
        await delay(8 * 60 * 60);
    }
}

main()