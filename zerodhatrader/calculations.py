# zerodhatrader/calculations.py

import numpy as np
from scipy.stats import norm
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Union
import math

class OptionsCalculator:
    """
    NSE-compliant options calculator implementing Black-Scholes model
    and Greeks calculations for Indian markets.
    """
    
    def __init__(self):
        self.trading_days_per_year = 252
        self.risk_free_rate = 0.065  # RBI repo rate
        self.lot_sizes = {
            'NIFTY': 75,
            'BANKNIFTY': 30
        }
        self.tick_size = 0.05
        
    def calculate_days_to_expiry(self, expiry_date: str) -> float:
        """Calculate trading days to expiry from current date."""
        expiry = datetime.strptime(expiry_date, '%Y-%m-%d')
        current = datetime.now()
        
        # Calculate business days (excluding weekends)
        days = 0
        current_date = current.date()
        expiry_date_obj = expiry.date()
        
        while current_date < expiry_date_obj:
            if current_date.weekday() < 5:  # Monday to Friday
                days += 1
            current_date += timedelta(days=1)
            
        return max(days, 1)  # Minimum 1 day to avoid division by zero
    
    def calculate_time_to_expiry(self, days_to_expiry: float) -> float:
        """Convert days to expiry to years."""
        return days_to_expiry / self.trading_days_per_year
    
    def black_scholes_price(self, spot: float, strike: float, time_to_expiry: float,
                           volatility: float, option_type: str) -> float:
        """
        Calculate option price using Black-Scholes formula.
        NSE-compliant implementation for Indian markets.
        """
        if time_to_expiry <= 0:
            # Handle expired options
            if option_type.upper() == 'CE':
                return max(spot - strike, 0)
            else:
                return max(strike - spot, 0)
        
        # Calculate d1 and d2
        d1 = (np.log(spot / strike) + (self.risk_free_rate + 0.5 * volatility ** 2) * time_to_expiry) / (volatility * np.sqrt(time_to_expiry))
        d2 = d1 - volatility * np.sqrt(time_to_expiry)
        
        if option_type.upper() == 'CE':
            # Call option
            price = spot * norm.cdf(d1) - strike * np.exp(-self.risk_free_rate * time_to_expiry) * norm.cdf(d2)
        else:
            # Put option
            price = strike * np.exp(-self.risk_free_rate * time_to_expiry) * norm.cdf(-d2) - spot * norm.cdf(-d1)
        
        # Round to nearest tick size
        return round(price / self.tick_size) * self.tick_size
    
    def calculate_implied_volatility(self, option_price: float, spot: float, strike: float,
                                   time_to_expiry: float, option_type: str) -> float:
        """
        Calculate implied volatility using Newton-Raphson method.
        """
        # Initial guess
        iv = 0.20  # 20% volatility as starting point
        tolerance = 0.0001
        max_iterations = 100
        
        for i in range(max_iterations):
            # Calculate theoretical price and vega
            theoretical_price = self.black_scholes_price(spot, strike, time_to_expiry, iv, option_type)
            vega = self.calculate_vega(spot, strike, time_to_expiry, iv) / 100  # Vega per 1% change
            
            # Check convergence
            price_diff = option_price - theoretical_price
            if abs(price_diff) < tolerance:
                return iv
            
            # Newton-Raphson update
            if vega != 0:
                iv = iv + price_diff / vega
                # Ensure IV stays within reasonable bounds
                iv = max(0.01, min(iv, 5.0))  # Between 1% and 500%
            else:
                # If vega is zero, use bisection method fallback
                if theoretical_price > option_price:
                    iv *= 0.9
                else:
                    iv *= 1.1
        
        return iv
    
    def calculate_delta(self, spot: float, strike: float, time_to_expiry: float,
                       volatility: float, option_type: str) -> float:
        """Calculate option delta."""
        if time_to_expiry <= 0:
            # Expired option delta
            if option_type.upper() == 'CE':
                return 1.0 if spot > strike else 0.0
            else:
                return -1.0 if spot < strike else 0.0
        
        d1 = (np.log(spot / strike) + (self.risk_free_rate + 0.5 * volatility ** 2) * time_to_expiry) / (volatility * np.sqrt(time_to_expiry))
        
        if option_type.upper() == 'CE':
            return norm.cdf(d1)
        else:
            return norm.cdf(d1) - 1
    
    def calculate_gamma(self, spot: float, strike: float, time_to_expiry: float,
                       volatility: float) -> float:
        """Calculate option gamma (same for calls and puts)."""
        if time_to_expiry <= 0:
            return 0.0
        
        d1 = (np.log(spot / strike) + (self.risk_free_rate + 0.5 * volatility ** 2) * time_to_expiry) / (volatility * np.sqrt(time_to_expiry))
        
        return norm.pdf(d1) / (spot * volatility * np.sqrt(time_to_expiry))
    
    def calculate_theta(self, spot: float, strike: float, time_to_expiry: float,
                       volatility: float, option_type: str) -> float:
        """Calculate option theta (time decay) per day."""
        if time_to_expiry <= 0:
            return 0.0
        
        d1 = (np.log(spot / strike) + (self.risk_free_rate + 0.5 * volatility ** 2) * time_to_expiry) / (volatility * np.sqrt(time_to_expiry))
        d2 = d1 - volatility * np.sqrt(time_to_expiry)
        
        if option_type.upper() == 'CE':
            theta = (-spot * norm.pdf(d1) * volatility / (2 * np.sqrt(time_to_expiry)) 
                    - self.risk_free_rate * strike * np.exp(-self.risk_free_rate * time_to_expiry) * norm.cdf(d2))
        else:
            theta = (-spot * norm.pdf(d1) * volatility / (2 * np.sqrt(time_to_expiry)) 
                    + self.risk_free_rate * strike * np.exp(-self.risk_free_rate * time_to_expiry) * norm.cdf(-d2))
        
        # Convert to per day
        return theta / self.trading_days_per_year
    
    def calculate_vega(self, spot: float, strike: float, time_to_expiry: float,
                      volatility: float) -> float:
        """Calculate option vega (same for calls and puts)."""
        if time_to_expiry <= 0:
            return 0.0
        
        d1 = (np.log(spot / strike) + (self.risk_free_rate + 0.5 * volatility ** 2) * time_to_expiry) / (volatility * np.sqrt(time_to_expiry))
        
        return spot * norm.pdf(d1) * np.sqrt(time_to_expiry) / 100  # Per 1% change in volatility
    
    def calculate_rho(self, spot: float, strike: float, time_to_expiry: float,
                     volatility: float, option_type: str) -> float:
        """Calculate option rho."""
        if time_to_expiry <= 0:
            return 0.0
        
        d1 = (np.log(spot / strike) + (self.risk_free_rate + 0.5 * volatility ** 2) * time_to_expiry) / (volatility * np.sqrt(time_to_expiry))
        d2 = d1 - volatility * np.sqrt(time_to_expiry)
        
        if option_type.upper() == 'CE':
            return strike * time_to_expiry * np.exp(-self.risk_free_rate * time_to_expiry) * norm.cdf(d2) / 100
        else:
            return -strike * time_to_expiry * np.exp(-self.risk_free_rate * time_to_expiry) * norm.cdf(-d2) / 100
    
    def calculate_all_greeks(self, spot: float, strike: float, expiry_date: str,
                           volatility: float, option_type: str) -> Dict[str, float]:
        """Calculate all Greeks for an option."""
        days_to_expiry = self.calculate_days_to_expiry(expiry_date)
        time_to_expiry = self.calculate_time_to_expiry(days_to_expiry)
        
        return {
            'delta': self.calculate_delta(spot, strike, time_to_expiry, volatility, option_type),
            'gamma': self.calculate_gamma(spot, strike, time_to_expiry, volatility),
            'theta': self.calculate_theta(spot, strike, time_to_expiry, volatility, option_type),
            'vega': self.calculate_vega(spot, strike, time_to_expiry, volatility),
            'rho': self.calculate_rho(spot, strike, time_to_expiry, volatility, option_type)
        }


class RiskValidator:
    """
    Risk management and validation system for options trading.
    """
    
    def __init__(self):
        self.max_position_value = 1000000  # 10 lakh max position value
        self.max_loss_per_trade = 50000    # 50k max loss per trade
        self.min_liquidity_ratio = 0.1     # Minimum 10% of open interest
        self.lot_sizes = {
            'NIFTY': 75,
            'BANKNIFTY': 30
        }
    
    def validate_position_size(self, quantity: int, price: float, symbol: str) -> Dict[str, Union[bool, str]]:
        """Validate position size against risk limits."""
        # Check lot size compliance
        if 'NIFTY' in symbol:
            lot_size = self.lot_sizes['NIFTY']
            index = 'NIFTY'
        elif 'BANKNIFTY' in symbol:
            lot_size = self.lot_sizes['BANKNIFTY']
            index = 'BANKNIFTY'
        else:
            return {'valid': False, 'message': 'Unknown index type'}
        
        if quantity % lot_size != 0:
            return {
                'valid': False,
                'message': f'Quantity must be in multiples of {lot_size} for {index}'
            }
        
        # Check position value
        position_value = quantity * price
        if position_value > self.max_position_value:
            return {
                'valid': False,
                'message': f'Position value ₹{position_value:,.2f} exceeds maximum allowed ₹{self.max_position_value:,.2f}'
            }
        
        return {'valid': True, 'message': 'Position size validated'}
    
    def validate_liquidity(self, volume: int, open_interest: int, quantity: int) -> Dict[str, Union[bool, str]]:
        """Validate if position has sufficient liquidity."""
        if open_interest == 0:
            return {'valid': False, 'message': 'No open interest in this contract'}
        
        liquidity_ratio = quantity / open_interest
        if liquidity_ratio > self.min_liquidity_ratio:
            return {
                'valid': False,
                'message': f'Position size exceeds {self.min_liquidity_ratio*100}% of open interest'
            }
        
        if volume < quantity / 10:  # Daily volume should be at least 10% of position size
            return {
                'valid': False,
                'message': 'Insufficient daily volume for this position size'
            }
        
        return {'valid': True, 'message': 'Liquidity validated'}
    
    def calculate_margin_requirement(self, strategy_type: str, positions: List[Dict]) -> float:
        """
        Calculate simplified SPAN-based margin requirements.
        This is a simplified version - actual SPAN is more complex.
        """
        total_margin = 0
        
        if strategy_type == 'vertical_spread':
            # For spreads, margin is typically the maximum loss
            max_loss = self._calculate_max_loss_vertical_spread(positions)
            total_margin = max_loss
            
        elif strategy_type == 'iron_condor':
            # Iron condor margin is the maximum of put spread or call spread loss
            put_spread_loss = self._calculate_max_loss_vertical_spread([p for p in positions if p['option_type'] == 'PE'])
            call_spread_loss = self._calculate_max_loss_vertical_spread([p for p in positions if p['option_type'] == 'CE'])
            total_margin = max(put_spread_loss, call_spread_loss)
            
        elif strategy_type == 'calendar_spread':
            # Calendar spread margin is typically the cost of long option
            long_positions = [p for p in positions if p['transaction_type'] == 'BUY']
            total_margin = sum(p['premium'] * p['quantity'] for p in long_positions)
            
        else:
            # For other strategies, use a simplified calculation
            for position in positions:
                if position['transaction_type'] == 'SELL':
                    # Short option margin (simplified)
                    margin = position['spot_price'] * position['quantity'] * 0.15  # 15% of notional
                else:
                    # Long option margin is just the premium
                    margin = position['premium'] * position['quantity']
                total_margin += margin
        
        return total_margin
    
    def _calculate_max_loss_vertical_spread(self, positions: List[Dict]) -> float:
        """Calculate maximum loss for a vertical spread."""
        if len(positions) != 2:
            return float('inf')
        
        long_pos = next((p for p in positions if p['transaction_type'] == 'BUY'), None)
        short_pos = next((p for p in positions if p['transaction_type'] == 'SELL'), None)
        
        if not long_pos or not short_pos:
            return float('inf')
        
        # Maximum loss is the net debit paid or strike difference minus net credit received
        net_premium = (long_pos['premium'] - short_pos['premium']) * long_pos['quantity']
        strike_diff = abs(long_pos['strike'] - short_pos['strike']) * long_pos['quantity']
        
        if net_premium > 0:  # Debit spread
            return net_premium
        else:  # Credit spread
            return strike_diff + net_premium
    
    def validate_strategy_rules(self, strategy_type: str, positions: List[Dict]) -> Dict[str, Union[bool, str]]:
        """Validate strategy-specific rules."""
        if strategy_type == 'vertical_spread':
            if len(positions) != 2:
                return {'valid': False, 'message': 'Vertical spread must have exactly 2 legs'}
            
            if positions[0]['option_type'] != positions[1]['option_type']:
                return {'valid': False, 'message': 'Both options must be of same type (CE or PE)'}
            
            if positions[0]['expiry'] != positions[1]['expiry']:
                return {'valid': False, 'message': 'Both options must have same expiry'}
                
        elif strategy_type == 'iron_condor':
            if len(positions) != 4:
                return {'valid': False, 'message': 'Iron condor must have exactly 4 legs'}
            
            call_positions = [p for p in positions if p['option_type'] == 'CE']
            put_positions = [p for p in positions if p['option_type'] == 'PE']
            
            if len(call_positions) != 2 or len(put_positions) != 2:
                return {'valid': False, 'message': 'Iron condor must have 2 calls and 2 puts'}
                
        elif strategy_type == 'calendar_spread':
            if len(positions) != 2:
                return {'valid': False, 'message': 'Calendar spread must have exactly 2 legs'}
            
            if positions[0]['strike'] != positions[1]['strike']:
                return {'valid': False, 'message': 'Both options must have same strike price'}
            
            if positions[0]['expiry'] == positions[1]['expiry']:
                return {'valid': False, 'message': 'Options must have different expiry dates'}
        
        return {'valid': True, 'message': 'Strategy rules validated'}


class VerticalSpreadCalculator:
    """
    Calculator for vertical spreads (Bull/Bear Call/Put spreads).
    """
    
    def __init__(self, options_calculator: OptionsCalculator, risk_validator: RiskValidator):
        self.calc = options_calculator
        self.validator = risk_validator
    
    def calculate_bull_call_spread(self, spot: float, long_strike: float, short_strike: float,
                                  expiry: str, long_premium: float, short_premium: float,
                                  quantity: int, symbol: str) -> Dict:
        """Calculate Bull Call Spread metrics."""
        # Validate strikes
        if long_strike >= short_strike:
            raise ValueError("Long strike must be lower than short strike for bull call spread")
        
        # Calculate net debit
        net_debit = (long_premium - short_premium) * quantity
        
        # Calculate breakeven
        breakeven = long_strike + (long_premium - short_premium)
        
        # Calculate max profit and loss
        max_profit = (short_strike - long_strike - (long_premium - short_premium)) * quantity
        max_loss = net_debit
        
        # Calculate current P&L at different spot prices
        spot_range = np.linspace(long_strike * 0.9, short_strike * 1.1, 50)
        pnl_range = []
        
        for s in spot_range:
            long_payoff = max(s - long_strike, 0) - long_premium
            short_payoff = short_premium - max(s - short_strike, 0)
            total_pnl = (long_payoff + short_payoff) * quantity
            pnl_range.append(total_pnl)
        
        # Calculate Greeks for the spread
        days_to_expiry = self.calc.calculate_days_to_expiry(expiry)
        time_to_expiry = self.calc.calculate_time_to_expiry(days_to_expiry)
        
        # Estimate IV from premiums
        long_iv = self.calc.calculate_implied_volatility(long_premium, spot, long_strike, time_to_expiry, 'CE')
        short_iv = self.calc.calculate_implied_volatility(short_premium, spot, short_strike, time_to_expiry, 'CE')
        
        long_greeks = self.calc.calculate_all_greeks(spot, long_strike, expiry, long_iv, 'CE')
        short_greeks = self.calc.calculate_all_greeks(spot, short_strike, expiry, short_iv, 'CE')
        
        # Net Greeks
        net_greeks = {
            'delta': long_greeks['delta'] - short_greeks['delta'],
            'gamma': long_greeks['gamma'] - short_greeks['gamma'],
            'theta': long_greeks['theta'] - short_greeks['theta'],
            'vega': long_greeks['vega'] - short_greeks['vega'],
            'rho': long_greeks['rho'] - short_greeks['rho']
        }
        
        # Risk validation
        positions = [
            {'transaction_type': 'BUY', 'strike': long_strike, 'premium': long_premium, 
             'quantity': quantity, 'option_type': 'CE', 'expiry': expiry, 'spot_price': spot},
            {'transaction_type': 'SELL', 'strike': short_strike, 'premium': short_premium,
             'quantity': quantity, 'option_type': 'CE', 'expiry': expiry, 'spot_price': spot}
        ]
        
        margin_required = self.validator.calculate_margin_requirement('vertical_spread', positions)
        
        return {
            'strategy': 'Bull Call Spread',
            'net_debit': net_debit,
            'breakeven': breakeven,
            'max_profit': max_profit,
            'max_loss': max_loss,
            'profit_probability': self._calculate_profit_probability(spot, breakeven, days_to_expiry, long_iv),
            'risk_reward_ratio': abs(max_profit / max_loss) if max_loss != 0 else float('inf'),
            'margin_required': margin_required,
            'greeks': net_greeks,
            'spot_range': spot_range.tolist(),
            'pnl_range': pnl_range,
            'days_to_expiry': days_to_expiry
        }
    
    def calculate_bear_put_spread(self, spot: float, long_strike: float, short_strike: float,
                                 expiry: str, long_premium: float, short_premium: float,
                                 quantity: int, symbol: str) -> Dict:
        """Calculate Bear Put Spread metrics."""
        # Validate strikes
        if long_strike <= short_strike:
            raise ValueError("Long strike must be higher than short strike for bear put spread")
        
        # Calculate net debit
        net_debit = (long_premium - short_premium) * quantity
        
        # Calculate breakeven
        breakeven = long_strike - (long_premium - short_premium)
        
        # Calculate max profit and loss
        max_profit = (long_strike - short_strike - (long_premium - short_premium)) * quantity
        max_loss = net_debit
        
        # Similar calculations as bull call spread but for put options
        positions = [
            {'transaction_type': 'BUY', 'strike': long_strike, 'premium': long_premium,
             'quantity': quantity, 'option_type': 'PE', 'expiry': expiry, 'spot_price': spot},
            {'transaction_type': 'SELL', 'strike': short_strike, 'premium': short_premium,
             'quantity': quantity, 'option_type': 'PE', 'expiry': expiry, 'spot_price': spot}
        ]
        
        margin_required = self.validator.calculate_margin_requirement('vertical_spread', positions)
        
        return {
            'strategy': 'Bear Put Spread',
            'net_debit': net_debit,
            'breakeven': breakeven,
            'max_profit': max_profit,
            'max_loss': max_loss,
            'margin_required': margin_required,
            'days_to_expiry': self.calc.calculate_days_to_expiry(expiry)
        }
    
    def _calculate_profit_probability(self, spot: float, breakeven: float, days: float, volatility: float) -> float:
        """Calculate probability of profit using normal distribution."""
        # Simplified probability calculation
        time_to_expiry = days / self.calc.trading_days_per_year
        std_dev = spot * volatility * np.sqrt(time_to_expiry)
        z_score = (breakeven - spot) / std_dev
        
        # For bull strategies, we need spot > breakeven
        return 1 - norm.cdf(z_score)


class IronCondorCalculator:
    """
    Calculator for Iron Condor strategies.
    """
    
    def __init__(self, options_calculator: OptionsCalculator, risk_validator: RiskValidator):
        self.calc = options_calculator
        self.validator = risk_validator
    
    def calculate_iron_condor(self, spot: float, put_long_strike: float, put_short_strike: float,
                            call_short_strike: float, call_long_strike: float, expiry: str,
                            put_long_premium: float, put_short_premium: float,
                            call_short_premium: float, call_long_premium: float,
                            quantity: int, symbol: str) -> Dict:
        """
        Calculate Iron Condor metrics.
        Structure: Buy OTM Put, Sell OTM Put, Sell OTM Call, Buy OTM Call
        """
        # Validate strike order
        if not (put_long_strike < put_short_strike < call_short_strike < call_long_strike):
            raise ValueError("Invalid strike order for iron condor")
        
        # Calculate net credit
        net_credit = ((put_short_premium - put_long_premium) + 
                     (call_short_premium - call_long_premium)) * quantity
        
        # Calculate breakevens
        lower_breakeven = put_short_strike - (net_credit / quantity)
        upper_breakeven = call_short_strike + (net_credit / quantity)
        
        # Calculate max profit and loss
        max_profit = net_credit
        put_spread_width = put_short_strike - put_long_strike
        call_spread_width = call_long_strike - call_short_strike
        max_loss = (min(put_spread_width, call_spread_width) * quantity) - net_credit
        
        # Calculate profit zone
        profit_zone_width = upper_breakeven - lower_breakeven
        
        # Prepare positions for validation
        positions = [
            {'transaction_type': 'BUY', 'strike': put_long_strike, 'premium': put_long_premium,
             'quantity': quantity, 'option_type': 'PE', 'expiry': expiry, 'spot_price': spot},
            {'transaction_type': 'SELL', 'strike': put_short_strike, 'premium': put_short_premium,
             'quantity': quantity, 'option_type': 'PE', 'expiry': expiry, 'spot_price': spot},
            {'transaction_type': 'SELL', 'strike': call_short_strike, 'premium': call_short_premium,
             'quantity': quantity, 'option_type': 'CE', 'expiry': expiry, 'spot_price': spot},
            {'transaction_type': 'BUY', 'strike': call_long_strike, 'premium': call_long_premium,
             'quantity': quantity, 'option_type': 'CE', 'expiry': expiry, 'spot_price': spot}
        ]
        
        margin_required = self.validator.calculate_margin_requirement('iron_condor', positions)
        
        # Calculate probability of profit (spot staying between short strikes)
        days_to_expiry = self.calc.calculate_days_to_expiry(expiry)
        time_to_expiry = days_to_expiry / self.calc.trading_days_per_year
        
        # Estimate average IV
        avg_iv = 0.25  # Placeholder - should calculate from actual premiums
        
        # Probability calculations
        std_dev = spot * avg_iv * np.sqrt(time_to_expiry)
        lower_z = (put_short_strike - spot) / std_dev
        upper_z = (call_short_strike - spot) / std_dev
        
        probability_of_profit = norm.cdf(upper_z) - norm.cdf(lower_z)
        
        return {
            'strategy': 'Iron Condor',
            'net_credit': net_credit,
            'lower_breakeven': lower_breakeven,
            'upper_breakeven': upper_breakeven,
            'profit_zone_width': profit_zone_width,
            'max_profit': max_profit,
            'max_loss': max_loss,
            'risk_reward_ratio': abs(max_loss / max_profit) if max_profit != 0 else float('inf'),
            'probability_of_profit': probability_of_profit,
            'margin_required': margin_required,
            'days_to_expiry': days_to_expiry,
            'positions': positions
        }


class ButterflyCalculator:
    """
    Calculator for Butterfly spread strategies.
    """
    
    def __init__(self, options_calculator: OptionsCalculator, risk_validator: RiskValidator):
        self.calc = options_calculator
        self.validator = risk_validator
    
    def calculate_long_butterfly(self, spot: float, lower_strike: float, middle_strike: float,
                               upper_strike: float, expiry: str, lower_premium: float,
                               middle_premium: float, upper_premium: float,
                               quantity: int, option_type: str, symbol: str) -> Dict:
        """
        Calculate Long Butterfly metrics.
        Structure: Buy 1 lower, Sell 2 middle, Buy 1 upper (all same type)
        """
        # Validate strikes are equidistant
        if (middle_strike - lower_strike) != (upper_strike - middle_strike):
            raise ValueError("Strikes must be equidistant for butterfly spread")
        
        # Calculate net debit (buy 1 + buy 1 - sell 2)
        net_debit = (lower_premium + upper_premium - 2 * middle_premium) * quantity
        
        # Calculate breakevens
        lower_breakeven = lower_strike + (net_debit / quantity)
        upper_breakeven = upper_strike - (net_debit / quantity)
        
        # Calculate max profit and loss
        max_profit = ((middle_strike - lower_strike) * quantity) - net_debit
        max_loss = net_debit
        
        # Profit occurs when spot is near middle strike at expiry
        profit_zone_width = upper_breakeven - lower_breakeven
        
        # Calculate P&L at various spot prices
        spot_range = np.linspace(lower_strike * 0.95, upper_strike * 1.05, 100)
        pnl_range = []
        
        for s in spot_range:
            if option_type.upper() == 'CE':
                lower_payoff = max(s - lower_strike, 0) - lower_premium
                middle_payoff = 2 * (middle_premium - max(s - middle_strike, 0))
                upper_payoff = max(s - upper_strike, 0) - upper_premium
            else:  # PE
                lower_payoff = max(lower_strike - s, 0) - lower_premium
                middle_payoff = 2 * (middle_premium - max(middle_strike - s, 0))
                upper_payoff = max(upper_strike - s, 0) - upper_premium
            
            total_pnl = (lower_payoff + middle_payoff + upper_payoff) * quantity
            pnl_range.append(total_pnl)
        
        positions = [
            {'transaction_type': 'BUY', 'strike': lower_strike, 'premium': lower_premium,
             'quantity': quantity, 'option_type': option_type, 'expiry': expiry, 'spot_price': spot},
            {'transaction_type': 'SELL', 'strike': middle_strike, 'premium': middle_premium,
             'quantity': quantity * 2, 'option_type': option_type, 'expiry': expiry, 'spot_price': spot},
            {'transaction_type': 'BUY', 'strike': upper_strike, 'premium': upper_premium,
             'quantity': quantity, 'option_type': option_type, 'expiry': expiry, 'spot_price': spot}
        ]
        
        return {
            'strategy': f'Long {option_type} Butterfly',
            'net_debit': net_debit,
            'lower_breakeven': lower_breakeven,
            'upper_breakeven': upper_breakeven,
            'profit_zone_width': profit_zone_width,
            'max_profit': max_profit,
            'max_loss': max_loss,
            'risk_reward_ratio': abs(max_profit / max_loss) if max_loss != 0 else float('inf'),
            'optimal_spot': middle_strike,
            'spot_range': spot_range.tolist(),
            'pnl_range': pnl_range,
            'positions': positions
        }


class CalendarSpreadCalculator:
    """
    Calculator for Calendar (Time) spread strategies.
    """
    
    def __init__(self, options_calculator: OptionsCalculator, risk_validator: RiskValidator):
        self.calc = options_calculator
        self.validator = risk_validator
    
    def calculate_calendar_spread(self, spot: float, strike: float, near_expiry: str,
                                far_expiry: str, near_premium: float, far_premium: float,
                                quantity: int, option_type: str, symbol: str) -> Dict:
        """
        Calculate Calendar Spread metrics.
        Structure: Sell near-term option, Buy far-term option (same strike)
        """
        # Calculate days to expiry for both legs
        near_days = self.calc.calculate_days_to_expiry(near_expiry)
        far_days = self.calc.calculate_days_to_expiry(far_expiry)
        
        if near_days >= far_days:
            raise ValueError("Near expiry must be before far expiry")
        
        # Calculate net debit
        net_debit = (far_premium - near_premium) * quantity
        
        # Calculate time decay advantage
        near_time = near_days / self.calc.trading_days_per_year
        far_time = far_days / self.calc.trading_days_per_year
        
        # Estimate IVs
        near_iv = self.calc.calculate_implied_volatility(near_premium, spot, strike, near_time, option_type)
        far_iv = self.calc.calculate_implied_volatility(far_premium, spot, strike, far_time, option_type)
        
        # Calculate Greeks for both legs
        near_greeks = self.calc.calculate_all_greeks(spot, strike, near_expiry, near_iv, option_type)
        far_greeks = self.calc.calculate_all_greeks(spot, strike, far_expiry, far_iv, option_type)
        
        # Net Greeks (short near + long far)
        net_greeks = {
            'delta': far_greeks['delta'] - near_greeks['delta'],
            'gamma': far_greeks['gamma'] - near_greeks['gamma'],
            'theta': far_greeks['theta'] - near_greeks['theta'],
            'vega': far_greeks['vega'] - near_greeks['vega']
        }
        
        # IV difference
        iv_difference = near_iv - far_iv
        
        # Theta ratio (how much faster near option decays)
        theta_ratio = abs(near_greeks['theta'] / far_greeks['theta']) if far_greeks['theta'] != 0 else 0
        
        # Maximum profit occurs when near option expires worthless
        # and far option retains significant value
        max_profit_estimate = near_premium * quantity  # Simplified estimate
        max_loss = net_debit  # If far option also becomes worthless
        
        # Calculate profitability metrics
        days_to_near_expiry = near_days
        optimal_holding_period = int(near_days * 0.7)  # Hold until 70% of near expiry
        
        positions = [
            {'transaction_type': 'SELL', 'strike': strike, 'premium': near_premium,
             'quantity': quantity, 'option_type': option_type, 'expiry': near_expiry, 'spot_price': spot},
            {'transaction_type': 'BUY', 'strike': strike, 'premium': far_premium,
             'quantity': quantity, 'option_type': option_type, 'expiry': far_expiry, 'spot_price': spot}
        ]
        
        margin_required = self.validator.calculate_margin_requirement('calendar_spread', positions)
        
        return {
            'strategy': f'Calendar Spread ({option_type})',
            'net_debit': net_debit,
            'near_iv': near_iv,
            'far_iv': far_iv,
            'iv_difference': iv_difference,
            'theta_ratio': theta_ratio,
            'net_greeks': net_greeks,
            'max_profit_estimate': max_profit_estimate,
            'max_loss': max_loss,
            'days_to_near_expiry': days_to_near_expiry,
            'days_to_far_expiry': far_days,
            'optimal_holding_period': optimal_holding_period,
            'margin_required': margin_required,
            'favorable_conditions': {
                'iv_difference_positive': iv_difference > 0,
                'theta_ratio_high': theta_ratio > 2,
                'adequate_time_spread': (far_days - near_days) > 20
            }
        }


class DiagonalSpreadCalculator:
    """
    Calculator for Diagonal spread strategies.
    """
    
    def __init__(self, options_calculator: OptionsCalculator, risk_validator: RiskValidator):
        self.calc = options_calculator
        self.validator = risk_validator
    
    def calculate_diagonal_spread(self, spot: float, near_strike: float, far_strike: float,
                                near_expiry: str, far_expiry: str, near_premium: float,
                                far_premium: float, quantity: int, option_type: str,
                                spread_type: str, symbol: str) -> Dict:
        """
        Calculate Diagonal Spread metrics.
        spread_type: 'bullish' or 'bearish'
        """
        # Validate inputs
        near_days = self.calc.calculate_days_to_expiry(near_expiry)
        far_days = self.calc.calculate_days_to_expiry(far_expiry)
        
        if near_days >= far_days:
            raise ValueError("Near expiry must be before far expiry")
        
        # Determine position structure based on spread type
        if spread_type.lower() == 'bullish' and option_type.upper() == 'CE':
            # Bullish diagonal call: Sell near OTM, Buy far ITM
            if near_strike <= far_strike:
                raise ValueError("For bullish diagonal call, near strike should be > far strike")
        elif spread_type.lower() == 'bearish' and option_type.upper() == 'PE':
            # Bearish diagonal put: Sell near OTM, Buy far ITM
            if near_strike >= far_strike:
                raise ValueError("For bearish diagonal put, near strike should be < far strike")
        
        # Calculate net debit/credit
        net_cost = (far_premium - near_premium) * quantity
        
        # Calculate time values
        near_time = near_days / self.calc.trading_days_per_year
        far_time = far_days / self.calc.trading_days_per_year
        
        # Estimate IVs
        near_iv = self.calc.calculate_implied_volatility(near_premium, spot, near_strike, near_time, option_type)
        far_iv = self.calc.calculate_implied_volatility(far_premium, spot, far_strike, far_time, option_type)
        
        # Calculate Greeks
        near_greeks = self.calc.calculate_all_greeks(spot, near_strike, near_expiry, near_iv, option_type)
        far_greeks = self.calc.calculate_all_greeks(spot, far_strike, far_expiry, far_iv, option_type)
        
        # Net Greeks
        net_greeks = {
            'delta': far_greeks['delta'] - near_greeks['delta'],
            'gamma': far_greeks['gamma'] - near_greeks['gamma'],
            'theta': far_greeks['theta'] - near_greeks['theta'],
            'vega': far_greeks['vega'] - near_greeks['vega']
        }
        
        # Calculate profit zones
        # Maximum profit at near expiry when near option expires worthless
        # and far option has intrinsic value
        if option_type.upper() == 'CE':
            profit_zone_start = near_strike
            profit_zone_end = far_strike if spread_type.lower() == 'bearish' else float('inf')
        else:  # PE
            profit_zone_start = far_strike if spread_type.lower() == 'bullish' else 0
            profit_zone_end = near_strike
        
        positions = [
            {'transaction_type': 'SELL', 'strike': near_strike, 'premium': near_premium,
             'quantity': quantity, 'option_type': option_type, 'expiry': near_expiry, 'spot_price': spot},
            {'transaction_type': 'BUY', 'strike': far_strike, 'premium': far_premium,
             'quantity': quantity, 'option_type': option_type, 'expiry': far_expiry, 'spot_price': spot}
        ]
        
        return {
            'strategy': f'{spread_type.capitalize()} Diagonal {option_type} Spread',
            'net_cost': net_cost,
            'position_type': 'Net Debit' if net_cost > 0 else 'Net Credit',
            'near_strike': near_strike,
            'far_strike': far_strike,
            'strike_difference': abs(far_strike - near_strike),
            'time_difference_days': far_days - near_days,
            'net_greeks': net_greeks,
            'profit_zone': {
                'start': profit_zone_start,
                'end': profit_zone_end
            },
            'iv_skew': near_iv - far_iv,
            'favorable_move_direction': 'Up' if spread_type.lower() == 'bullish' else 'Down',
            'positions': positions
        }


class RatioSpreadCalculator:
    """
    Calculator for Ratio spread strategies.
    """
    
    def __init__(self, options_calculator: OptionsCalculator, risk_validator: RiskValidator):
        self.calc = options_calculator
        self.validator = risk_validator
    
    def calculate_ratio_spread(self, spot: float, long_strike: float, short_strike: float,
                             expiry: str, long_premium: float, short_premium: float,
                             long_quantity: int, short_quantity: int, option_type: str,
                             symbol: str) -> Dict:
        """
        Calculate Ratio Spread metrics.
        Common ratios: 1:2, 1:3, 2:3
        """
        # Validate ratio
        if short_quantity <= long_quantity:
            raise ValueError("Short quantity must be greater than long quantity for ratio spread")
        
        ratio = short_quantity / long_quantity
        
        # Calculate net credit/debit
        total_long_cost = long_premium * long_quantity
        total_short_credit = short_premium * short_quantity
        net_position = total_short_credit - total_long_cost
        
        # Calculate breakeven points
        if option_type.upper() == 'CE':
            # Call ratio spread
            if net_position > 0:  # Net credit
                lower_breakeven = long_strike - (net_position / long_quantity)
                # Upper breakeven where losses from excess shorts offset initial credit
                excess_shorts = short_quantity - long_quantity
                upper_breakeven = short_strike + (net_position / excess_shorts)
            else:  # Net debit
                lower_breakeven = long_strike + (abs(net_position) / long_quantity)
                upper_breakeven = float('inf')  # Unlimited risk on upside
        else:
            # Put ratio spread - mirror calculations
            if net_position > 0:  # Net credit
                upper_breakeven = long_strike + (net_position / long_quantity)
                excess_shorts = short_quantity - long_quantity
                lower_breakeven = short_strike - (net_position / excess_shorts)
            else:  # Net debit
                upper_breakeven = long_strike - (abs(net_position) / long_quantity)
                lower_breakeven = 0  # Limited by zero
        
        # Calculate maximum profit
        # Occurs when all short options expire worthless
        max_profit = net_position if net_position > 0 else (short_strike - long_strike) * long_quantity - abs(net_position)
        
        # Risk assessment
        unlimited_risk_direction = 'Upside' if option_type.upper() == 'CE' else 'Downside'
        
        # Calculate Greeks
        days_to_expiry = self.calc.calculate_days_to_expiry(expiry)
        time_to_expiry = days_to_expiry / self.calc.trading_days_per_year
        
        # Estimate IVs
        long_iv = self.calc.calculate_implied_volatility(long_premium, spot, long_strike, time_to_expiry, option_type)
        short_iv = self.calc.calculate_implied_volatility(short_premium, spot, short_strike, time_to_expiry, option_type)
        
        long_greeks = self.calc.calculate_all_greeks(spot, long_strike, expiry, long_iv, option_type)
        short_greeks = self.calc.calculate_all_greeks(spot, short_strike, expiry, short_iv, option_type)
        
        # Net Greeks considering quantities
        net_greeks = {
            'delta': long_greeks['delta'] * long_quantity - short_greeks['delta'] * short_quantity,
            'gamma': long_greeks['gamma'] * long_quantity - short_greeks['gamma'] * short_quantity,
            'theta': long_greeks['theta'] * long_quantity - short_greeks['theta'] * short_quantity,
            'vega': long_greeks['vega'] * long_quantity - short_greeks['vega'] * short_quantity
        }
        
        positions = [
            {'transaction_type': 'BUY', 'strike': long_strike, 'premium': long_premium,
             'quantity': long_quantity, 'option_type': option_type, 'expiry': expiry, 'spot_price': spot},
            {'transaction_type': 'SELL', 'strike': short_strike, 'premium': short_premium,
             'quantity': short_quantity, 'option_type': option_type, 'expiry': expiry, 'spot_price': spot}
        ]
        
        # Special margin calculation for ratio spreads (higher due to naked shorts)
        base_margin = self.validator.calculate_margin_requirement('vertical_spread', positions)
        excess_short_margin = (short_quantity - long_quantity) * spot * 0.20  # 20% for naked shorts
        total_margin = base_margin + excess_short_margin
        
        return {
            'strategy': f'{option_type} Ratio Spread ({long_quantity}:{short_quantity})',
            'ratio': ratio,
            'net_position': net_position,
            'position_type': 'Net Credit' if net_position > 0 else 'Net Debit',
            'lower_breakeven': lower_breakeven,
            'upper_breakeven': upper_breakeven,
            'max_profit': max_profit,
            'unlimited_risk_direction': unlimited_risk_direction,
            'net_greeks': net_greeks,
            'margin_required': total_margin,
            'risk_metrics': {
                'naked_short_quantity': short_quantity - long_quantity,
                'gamma_risk': 'High' if abs(net_greeks['gamma']) > 0.05 else 'Moderate',
                'suitable_for': 'Advanced traders only' if ratio > 2 else 'Experienced traders'
            },
            'positions': positions
        }


class OptionsStrategyManager:
    """
    Main manager class that orchestrates all strategy calculations.
    """
    
    def __init__(self):
        self.options_calc = OptionsCalculator()
        self.risk_validator = RiskValidator()
        
        # Initialize strategy calculators
        self.vertical_calc = VerticalSpreadCalculator(self.options_calc, self.risk_validator)
        self.condor_calc = IronCondorCalculator(self.options_calc, self.risk_validator)
        self.butterfly_calc = ButterflyCalculator(self.options_calc, self.risk_validator)
        self.calendar_calc = CalendarSpreadCalculator(self.options_calc, self.risk_validator)
        self.diagonal_calc = DiagonalSpreadCalculator(self.options_calc, self.risk_validator)
        self.ratio_calc = RatioSpreadCalculator(self.options_calc, self.risk_validator)
    
    def analyze_strategy(self, strategy_type: str, params: Dict) -> Dict:
        """
        Analyze any strategy based on type and parameters.
        Returns comprehensive analysis including risk metrics.
        """
        try:
            # Validate common parameters
            if 'symbol' in params:
                if params['symbol'] not in ['NIFTY', 'BANKNIFTY']:
                    raise ValueError("Symbol must be NIFTY or BANKNIFTY")
            
            # Route to appropriate calculator
            if strategy_type == 'bull_call_spread':
                result = self.vertical_calc.calculate_bull_call_spread(**params)
            elif strategy_type == 'bear_put_spread':
                result = self.vertical_calc.calculate_bear_put_spread(**params)
            elif strategy_type == 'iron_condor':
                result = self.condor_calc.calculate_iron_condor(**params)
            elif strategy_type == 'butterfly':
                result = self.butterfly_calc.calculate_long_butterfly(**params)
            elif strategy_type == 'calendar_spread':
                result = self.calendar_calc.calculate_calendar_spread(**params)
            elif strategy_type == 'diagonal_spread':
                result = self.diagonal_calc.calculate_diagonal_spread(**params)
            elif strategy_type == 'ratio_spread':
                result = self.ratio_calc.calculate_ratio_spread(**params)
            else:
                raise ValueError(f"Unknown strategy type: {strategy_type}")
            
            # Add common analysis elements
            result['analysis_timestamp'] = datetime.now().isoformat()
            result['market_conditions'] = self._assess_market_conditions(params.get('spot', 0))
            
            return {
                'status': 'success',
                'data': result
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'message': str(e),
                'strategy_type': strategy_type
            }
    
    def _assess_market_conditions(self, spot: float) -> Dict:
        """Assess current market conditions for strategy selection."""
        # This is a placeholder - in production, you would integrate with
        # real market data to assess volatility regime, trend, etc.
        return {
            'volatility_regime': 'Normal',
            'trend': 'Neutral',
            'suitable_strategies': ['iron_condor', 'calendar_spread', 'butterfly']
        }
    
    def get_strategy_recommendations(self, market_outlook: str, risk_tolerance: str) -> List[Dict]:
        """Get strategy recommendations based on market outlook and risk tolerance."""
        recommendations = []
        
        outlook_strategies = {
            'bullish': ['bull_call_spread', 'bull_put_spread', 'long_call'],
            'bearish': ['bear_put_spread', 'bear_call_spread', 'long_put'],
            'neutral': ['iron_condor', 'butterfly', 'calendar_spread'],
            'volatile': ['long_straddle', 'long_strangle'],
            'range_bound': ['short_straddle', 'iron_condor', 'butterfly']
        }
        
        risk_strategies = {
            'conservative': ['bull_call_spread', 'bear_put_spread', 'covered_call'],
            'moderate': ['iron_condor', 'calendar_spread', 'diagonal_spread'],
            'aggressive': ['ratio_spread', 'naked_options', 'long_options']
        }
        
        # Get intersection of outlook and risk appropriate strategies
        suitable_strategies = set(outlook_strategies.get(market_outlook.lower(), []))
        risk_appropriate = set(risk_strategies.get(risk_tolerance.lower(), []))
        
        # Find strategies that match both criteria, or just outlook if no intersection
        recommended = list(suitable_strategies.intersection(risk_appropriate))
        if not recommended:
            recommended = list(suitable_strategies)
        
        for strategy in recommended:
            recommendations.append({
                'strategy': strategy,
                'suitability_score': self._calculate_suitability_score(strategy, market_outlook, risk_tolerance),
                'description': self._get_strategy_description(strategy)
            })
        
        # Sort by suitability score
        recommendations.sort(key=lambda x: x['suitability_score'], reverse=True)
        
        return recommendations
    
    def _calculate_suitability_score(self, strategy: str, outlook: str, risk_tolerance: str) -> float:
        """Calculate how suitable a strategy is for given conditions."""
        base_score = 50
        
        # Outlook alignment
        outlook_bonus = {
            'bullish': {'bull_call_spread': 30, 'bull_put_spread': 25},
            'bearish': {'bear_put_spread': 30, 'bear_call_spread': 25},
            'neutral': {'iron_condor': 30, 'butterfly': 25, 'calendar_spread': 20}
        }
        
        # Risk alignment
        risk_bonus = {
            'conservative': {'covered_call': 20, 'bull_call_spread': 15},
            'moderate': {'iron_condor': 20, 'calendar_spread': 15},
            'aggressive': {'ratio_spread': 20, 'long_options': 15}
        }
        
        score = base_score
        score += outlook_bonus.get(outlook, {}).get(strategy, 0)
        score += risk_bonus.get(risk_tolerance, {}).get(strategy, 0)
        
        return min(score, 100)
    
    def _get_strategy_description(self, strategy: str) -> str:
        """Get description for a strategy."""
        descriptions = {
            'bull_call_spread': 'Limited risk bullish strategy using call options',
            'bear_put_spread': 'Limited risk bearish strategy using put options',
            'iron_condor': 'Neutral strategy profiting from low volatility',
            'butterfly': 'Limited risk strategy for specific price target',
            'calendar_spread': 'Time decay strategy using different expiries',
            'diagonal_spread': 'Combines directional view with time decay',
            'ratio_spread': 'Advanced strategy with unbalanced quantities'
        }
        
        return descriptions.get(strategy, 'Options trading strategy')


# Utility functions
def validate_option_data(option_data: Dict) -> bool:
    """Validate that option data has all required fields."""
    required_fields = ['strike', 'premium', 'expiry', 'option_type', 'quantity']
    return all(field in option_data for field in required_fields)


def calculate_position_pnl(entry_price: float, current_price: float, quantity: int,
                          transaction_type: str) -> float:
    """Calculate P&L for a position."""
    if transaction_type.upper() == 'BUY':
        return (current_price - entry_price) * quantity
    else:  # SELL
        return (entry_price - current_price) * quantity


def format_indian_currency(amount: float) -> str:
    """Format amount in Indian currency style."""
    amount_str = f"{abs(amount):,.2f}"
    return f"₹{amount_str}" if amount >= 0 else f"-₹{amount_str[1:]}"


# Example usage and testing
if __name__ == "__main__":
    # Initialize the strategy manager
    manager = OptionsStrategyManager()
    
    # Example: Analyze a Bull Call Spread
    bull_call_params = {
        'spot': 22500,
        'long_strike': 22400,
        'short_strike': 22600,
        'expiry': '2024-12-26',
        'long_premium': 150,
        'short_premium': 75,
        'quantity': 75,
        'symbol': 'NIFTY'
    }
    
    result = manager.analyze_strategy('bull_call_spread', bull_call_params)
    
    if result['status'] == 'success':
        print("Bull Call Spread Analysis:")
        print(f"Net Debit: {format_indian_currency(result['data']['net_debit'])}")
        print(f"Max Profit: {format_indian_currency(result['data']['max_profit'])}")
        print(f"Max Loss: {format_indian_currency(result['data']['max_loss'])}")
        print(f"Breakeven: {result['data']['breakeven']}")
        print(f"Risk-Reward Ratio: {result['data']['risk_reward_ratio']:.2f}")