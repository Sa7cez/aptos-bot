import * as dotenv from "dotenv"
import { AptosClient, AptosAccount, CoinClient } from "aptos"
import { promises as fs } from 'fs'
import * as path from 'path'

import delay from "delay"
import { Telegraf } from "telegraf"

dotenv.config()
const NODE_URL = process.env.NODE_URL
const BOT = process.env.BOT_TOKEN
const ADMIN = process.env.TELEGRAM_ID
const FAUCET_KEY = process.env.FAUCET_KEY
const END_KEY = process.env.END_KEY
const SWAPS = process.env.MAX_SWAPS || 3
const MIXS = parseInt(process.env.MAX_MIXS) || 2
const TIMEOUT = parseInt(process.env.TIMEOUT || '250')
const GLOBAL_DELAY = parseInt(process.env.GLOBAL_DELAY || '10000')
const AMOUNT = Math.floor((parseInt(process.env.MAX_AMOUNT || '1') / 2) * 100000000)

// Init
const OUTPUT = path.join(__dirname, '/wallets')
if (!fs.access(OUTPUT))
  fs.mkdir(OUTPUT).then(() => console.log('New directory created!'))
else
  console.log(OUTPUT + ' exists!')

const bot = new Telegraf(BOT)
const client = new AptosClient(NODE_URL)
const coinClient = new CoinClient(client)
// const tokenClient = new TokenClient(client)

// Helpers
const toAPT = (value: bigint | string, fixed = 4) => (Number(value) / 100000000).toFixed(fixed)
const randomInt = (value) => Math.floor(Math.random() * value)

// Transactions
const sendTransaction = async (wallet : AptosAccount, payload, simulate = false) => {
  try {
    const rawTxn = await client.generateTransaction(wallet.address(), payload)
    const bcsTxn = await client.signTransaction(wallet, rawTxn)
    if (simulate) {
      const simulate = await client.simulateTransaction(wallet, rawTxn)
      console.log(simulate)
      return true
    }
    const transaction = await client.submitTransaction(bcsTxn)

    // console.log('https://explorer.aptoslabs.com/txn/' + transaction.hash + '?network=testnet')
    return await client.waitForTransactionWithResult(transaction.hash)
  } catch (e) {
    console.log(e)
    return 'Send transaction error'
  }
}

// Get wallet by key
const getSigner = async (key) => await AptosAccount.fromAptosAccountObject({ privateKeyHex: key });

// Send some APT
const sendSomeAPT = async (from : AptosAccount, to : AptosAccount, amount : bigint) =>
  await sendTransaction(from, {
    "function": "0x1::aptos_account::transfer",
    "type_arguments": [],
    "arguments": [
      to.address(),
      amount
    ]
  })

// Aptoswap contract
const contract = '0xa5d3ac4d429052674ed38adc62d010e52d7c24ca159194d17ddc196ddb7e480b'
const swap = async (wallet : AptosAccount) => {
  const input = '0x1::aptos_coin::AptosCoin'
  const output = '0x498d8926f16eb9ca90cab1b3a26aa6f97a080b3fcbe6e83ae150b7243a00fb68::devnet_coins::DevnetBTC'
  const balance = await coinClient.checkBalance(wallet).catch(e => null) - BigInt(100000000 + randomInt(100000))
  let outputAmount = parseInt(balance.toString())
  const inputAmount = Math.floor(outputAmount / 3.741)
  
  await sendTransaction(wallet, {
    "function": `${contract}::pool::swap_y_to_x`,
    "type_arguments": [ output, input ],
    "arguments": [ BigInt(outputAmount).toString(), BigInt(inputAmount).toString() ]
  })

  await delay(TIMEOUT + randomInt(TIMEOUT))

  outputAmount = Math.floor(inputAmount * 3.649)
  await sendTransaction(wallet, {
    "function": `${contract}::pool::swap_x_to_y`,
    "type_arguments": [ output, input ],
    "arguments": [ BigInt(inputAmount).toString(), BigInt(outputAmount).toString() ]
  })
}

// Return all tokens
const sendAllAPT = async (from : AptosAccount, to : AptosAccount) => {
  const balance = await coinClient.checkBalance(from).catch(e => null)
  return sendSomeAPT(from, to, balance - await client.estimateMaxGasAmount(from.address()))
}

// Simple mixer
const mixer = async (faucet: AptosAccount, wallet: AptosAccount, amount, count = 2) => {
  const mixers = []
  for (let i = 0; i <= count; i++)
    mixers.push(await new AptosAccount())

  await sendSomeAPT(faucet, mixers[0], amount)
  for (let i = 0; i < mixers.length - 1; i++) {
    await sendAllAPT(mixers[i], mixers[i+1])
    await delay(1500)
    await fs.appendFile(path.join(__dirname, '/wallets/temps.txt'), `${mixers[i].toPrivateKeyObject().privateKeyHex}\n`)
  }
  await sendAllAPT(mixers[mixers.length-1], wallet)
}

// Swaps multiple
const someSwaps = async (wallet, timeout, repeats) => {
  for (let i = 0; i < repeats; i++) {
    await swap(wallet).catch(e => console.log(e))
    await delay(randomInt(timeout))
  }
}

const abuse = async () => {
  bot.telegram.sendMessage(ADMIN, 'Start abuse https://testnet.aptoswap.net/ !')
  const start = await getSigner(FAUCET_KEY)
  const end = await getSigner(END_KEY)

  for (;;) {
    await fs.appendFile(path.join(__dirname, '/wallets/temps.txt'), `test`)
    try {
      return
      const amount = BigInt(AMOUNT + randomInt(AMOUNT))
      const balance = await coinClient.checkBalance(start)

      if (balance < BigInt(amount)) {
        bot.telegram.sendMessage(ADMIN, 'Refill balance of faucet wallet!')
        await sendAllAPT(end, start)
      } else {
        const wallet = await new AptosAccount()
        
        console.log('1. Start mixing...')
        await mixer(start, wallet, amount, MIXS)

        console.log('2. Making swaps...')
        await someSwaps(wallet, 500, 1 + randomInt(SWAPS))

        console.log('3. Return funds...')
        await sendAllAPT(wallet, end)

        console.log('Wait some time and start again!\nPress CONTROL+C in two seconds to break script!')
        await fs.appendFile(path.join(__dirname, '/wallets/wallets.txt'), `${wallet.toPrivateKeyObject().privateKeyHex}\n`)
        bot.telegram.sendMessage(ADMIN, wallet.toPrivateKeyObject().privateKeyHex)
        await delay(GLOBAL_DELAY)
      }
    } catch (e) {
      console.log(e)
      bot.telegram.sendMessage(ADMIN, 'Abuse bot broken, see console logs and try reboot server!')
      await delay(5000)
    }
  } 
}

abuse()