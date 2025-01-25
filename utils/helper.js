import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { solve2Captcha, solveAntiCaptcha } from './solver.js';
import fs from 'fs/promises';
import log from './logger.js';
import readline from 'readline';


export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms * 1000));
}

// Save data to a file
export async function saveToFile(filename, data) {
    try {
        await fs.appendFile(filename, `${data}\n`, 'utf-8');
        log.info(`Data saved to ${filename}`);
    } catch (error) {
        log.error(`Failed to save data to ${filename}: ${error.message}`);
    }
}

// Read the file
export async function readFile(pathFile) {
    try {
        const datas = await fs.readFile(pathFile, 'utf8');
        return datas.split('\n')
            .map(data => data.trim())
            .filter(data => data.length > 0);
    } catch (error) {
        log.error(`Error reading file: ${error.message}`);
        return [];
    }
}

// Create an agent
export const newAgent = (proxy = null) => {
    if (proxy) {
        if (proxy.startsWith('http://')) {
            return new HttpsProxyAgent(proxy);
        } else if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
            return new SocksProxyAgent(proxy);
        } else {
            log.warn(`Unsupported proxy type: ${proxy}`);
            return null;
        }
    }
    return null;
};

export async function readWallets() {
    try {
        await fs.access("wallets.json");

        const data = await fs.readFile("wallets.json", "utf-8");
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            log.info("No wallets found in wallets.json");
            return [];
        }
        throw err;
    }
}

export async function solveCaptcha(apikey, type = '1') {
    try {
        const captcha = type === '1' ? await solve2Captcha(apikey) : await solveAntiCaptcha(apikey)
        return captcha;
    } catch (error) {
        log.error(`Error solving captcha: ${error.message}`);
        return null;
    }
}

export async function askQuestion(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}