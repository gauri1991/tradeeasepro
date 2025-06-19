# zerodhatrader/management/commands/download_instruments.py
import logging
from django.core.management.base import BaseCommand
from django.utils import timezone
from kiteconnect import KiteConnect
from zerodhatrader.models import ApiCredential, Instrument

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Download and update instruments from Kite Connect API'
    
    def handle(self, *args, **options):
        try:
            # Get active API credentials
            cred = ApiCredential.objects.filter(is_active=True).first()
            if not cred or not cred.access_token:
                self.stdout.write(self.style.ERROR('No active API credentials found with access token'))
                return
            
            # Initialize Kite client
            kite = KiteConnect(api_key=cred.api_key)
            kite.set_access_token(cred.access_token)
            
            self.stdout.write('Downloading instruments...')
            
            # Download instruments
            all_instruments = kite.instruments()
            
            self.stdout.write(f'Downloaded {len(all_instruments)} instruments')
            
            # Clear existing instruments
            Instrument.objects.all().delete()
            
            self.stdout.write('Creating instruments in database...')
            
            # Bulk create new instruments
            instruments_to_create = []
            for instr in all_instruments:
                # Handle None values for expiry
                expiry = None
                if instr.get('expiry') and instr['expiry'] != '':
                    expiry = instr['expiry']
                    
                instruments_to_create.append(Instrument(
                    instrument_token=instr['instrument_token'],
                    exchange_token=instr.get('exchange_token', 0),
                    tradingsymbol=instr['tradingsymbol'],
                    name=instr.get('name', ''),
                    last_price=instr.get('last_price', 0),
                    expiry=expiry,
                    strike=instr.get('strike', 0),
                    tick_size=instr.get('tick_size', 0),
                    lot_size=instr.get('lot_size', 0),
                    instrument_type=instr.get('instrument_type', ''),
                    segment=instr.get('segment', ''),
                    exchange=instr.get('exchange', '')
                ))
            
            # Insert in batches to avoid memory issues
            batch_size = 1000
            for i in range(0, len(instruments_to_create), batch_size):
                batch = instruments_to_create[i:i+batch_size]
                Instrument.objects.bulk_create(batch)
                self.stdout.write(f'Inserted batch {i//batch_size + 1}/{(len(instruments_to_create)-1)//batch_size + 1}')
            
            self.stdout.write(self.style.SUCCESS(f'Successfully imported {len(instruments_to_create)} instruments'))
            
        except Exception as e:
            logger.error(f"Error downloading instruments: {e}")
            self.stdout.write(self.style.ERROR(f'Error: {str(e)}'))