import axios from 'axios';
import { DataSourceConnector } from './base';
import { Liquidation, FundingRate, OpenInterest, Sentiment } from '../schemas';

export class CoinGlassConnector implements DataSourceConnector {
  private apiKey: string;
  private baseUrl = 'https://api.coinglass.com/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchLiquidations(symbol: string, startTime: number, endTime: number): Promise<Liquidation[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/liquidation`, {
        headers: { 'Authorization': this.apiKey },
        params: { symbol, startTime, endTime },
      });

      return response.data.map((item: any) => ({
        symbol: item.symbol,
        timestamp: item.timestamp,
        side: item.side.toLowerCase() as 'long' | 'short',
        price: item.price,
        value: item.value,
        exchange: item.exchange,
      }));
    } catch (error) {
      console.error('Error fetching liquidations from CoinGlass:', error);
      return [];
    }
  }

  async fetchFundingRates(symbol: string): Promise<FundingRate[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/funding_rate`, {
        headers: { 'Authorization': this.apiKey },
        params: { symbol },
      });

      return response.data.map((item: any) => ({
        symbol: item.symbol,
        timestamp: item.timestamp,
        fundingRate: item.fundingRate,
        fundingInterval: item.fundingInterval,
        nextFundingTime: item.nextFundingTime,
        markPrice: item.markPrice,
        indexPrice: item.indexPrice,
      }));
    } catch (error) {
      console.error('Error fetching funding rates from CoinGlass:', error);
      return [];
    }
  }

  async fetchOpenInterest(_symbol: string): Promise<OpenInterest[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/open_interest`, {
        headers: { 'Authorization': this.apiKey },
        params: { symbol: _symbol },
      });

      return response.data.map((item: any) => ({
        symbol: item.symbol,
        timestamp: item.timestamp,
        openInterest: item.openInterest,
        openInterestValue: item.openInterestValue,
      }));
    } catch (error) {
      console.error('Error fetching open interest from CoinGlass:', error);
      return [];
    }
  }

  async fetchSentiment(_symbol: string): Promise<Sentiment[]> {
    // CoinGlass doesn't provide sentiment data, return empty
    return [];
  }
}

export class AmberdataConnector implements DataSourceConnector {
  private apiKey: string;
  private baseUrl = 'https://web3api.io/api/v2';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchLiquidations(symbol: string, startTime: number, endTime: number): Promise<Liquidation[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/liquidations`, {
        headers: { 'x-api-key': this.apiKey },
        params: { symbol, startTime, endTime },
      });

      return response.data.map((item: any) => ({
        symbol: item.symbol,
        timestamp: item.timestamp,
        side: item.side.toLowerCase() as 'long' | 'short',
        price: item.price,
        value: item.value,
        exchange: item.exchange,
      }));
    } catch (error) {
      console.error('Error fetching liquidations from Amberdata:', error);
      return [];
    }
  }

  async fetchFundingRates(symbol: string): Promise<FundingRate[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/funding_rates`, {
        headers: { 'x-api-key': this.apiKey },
        params: { symbol },
      });

      return response.data.map((item: any) => ({
        symbol: item.symbol,
        timestamp: item.timestamp,
        fundingRate: item.fundingRate,
        fundingInterval: item.fundingInterval,
        nextFundingTime: item.nextFundingTime,
        markPrice: item.markPrice,
        indexPrice: item.indexPrice,
      }));
    } catch (error) {
      console.error('Error fetching funding rates from Amberdata:', error);
      return [];
    }
  }

  async fetchOpenInterest(_symbol: string): Promise<OpenInterest[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/open_interest`, {
        headers: { 'x-api-key': this.apiKey },
        params: { symbol: _symbol },
      });

      return response.data.map((item: any) => ({
        symbol: item.symbol,
        timestamp: item.timestamp,
        openInterest: item.openInterest,
        openInterestValue: item.openInterestValue,
      }));
    } catch (error) {
      console.error('Error fetching open interest from Amberdata:', error);
      return [];
    }
  }

  async fetchSentiment(_symbol: string): Promise<Sentiment[]> {
    // Amberdata doesn't provide sentiment data, return empty
    return [];
  }
}

export class TwitterConnector implements DataSourceConnector {
  private bearerToken: string;
  private baseUrl = 'https://api.twitter.com/2';

  constructor(bearerToken: string) {
    this.bearerToken = bearerToken;
  }

  async fetchLiquidations(_symbol: string, _startTime: number, _endTime: number): Promise<Liquidation[]> {
    return [];
  }

  async fetchFundingRates(_symbol: string): Promise<FundingRate[]> {
    return [];
  }

  async fetchOpenInterest(_symbol: string): Promise<OpenInterest[]> {
    return [];
  }

  async fetchSentiment(symbol: string): Promise<Sentiment[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/tweets/search/recent`, {
        headers: { 'Authorization': `Bearer ${this.bearerToken}` },
        params: {
          query: `${symbol} (BTC OR bitcoin OR crypto) -is:retweet`,
          'tweet.fields': 'created_at,public_metrics',
          max_results: 100,
        },
      });

      const sentiments: Sentiment[] = response.data.data.map((tweet: any) => {
        const text = tweet.text.toLowerCase();
        const bullishWords = ['buy', 'bull', 'moon', 'pump', 'up', 'long'];
        const bearishWords = ['sell', 'bear', 'dump', 'crash', 'down', 'short'];
        
        let score = 0;
        bullishWords.forEach(word => { if (text.includes(word)) score += 1; });
        bearishWords.forEach(word => { if (text.includes(word)) score -= 1; });
        
        const normalizedScore = Math.max(-1, Math.min(1, score / 3));

        return {
          symbol,
          timestamp: new Date(tweet.created_at).getTime(),
          sentiment: normalizedScore,
          source: 'twitter',
          volume: tweet.public_metrics?.like_count || 0,
        };
      });

      return sentiments;
    } catch (error) {
      console.error('Error fetching sentiment from Twitter:', error);
      return [];
    }
  }
}
