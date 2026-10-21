import { describe, expect, it, mock } from 'bun:test';
import { ScraperService } from './scraper.service';

const createService = () =>
  new ScraperService({} as any, {} as any, {} as any) as any;

describe('ScraperService vehicle post filters', () => {
  it('returns no job when another worker wins the conditional claim', async () => {
    const prisma: any = {
      scrapeJob: {
        findFirst: mock(async () => ({ id: 10, status: 'pending' })),
        updateMany: mock(async () => ({ count: 0 })),
      },
    };
    prisma.$transaction = async (callback: any) => callback(prisma);
    const service = new ScraperService(prisma, {} as any, {} as any);

    expect(await service.getNextPendingJob()).toBeNull();
    expect(prisma.scrapeJob.updateMany).toHaveBeenCalledWith({
      where: { id: 10, status: 'pending' },
      data: { status: 'running' },
    });
  });

  it('extracts mileage, price, and excluded exterior colors from retailer filters', () => {
    const service = createService();

    const filters = service.extractVehiclePostFilters({
      postFilters: {
        excludeExteriorColors: ['White'],
      },
      retailers: {
        autotrader: {
          filters: {
            path_components: {
              color: 'gray',
            },
          },
        },
        carmax: {
          filters: {
            mileageMax: 80000,
            maxPrice: 30000,
          },
        },
      },
    });

    expect(filters).toEqual({
      mileageMax: 80000,
      priceMax: 30000,
      includeExteriorColors: ['gray'],
      excludeExteriorColors: ['white'],
    });
  });

  it('filters listings over mileage, over price, or with mismatched colors when data is present', () => {
    const service = createService();
    const filters = {
      mileageMax: 80000,
      priceMax: 30000,
      includeExteriorColors: ['gray'],
      excludeExteriorColors: ['white'],
    };

    expect(
      service.passesVehiclePostFilters(
        { name: '2021 Honda Passport', price: '$29,500', mileage: '79,000 mi', exteriorColor: 'Gray' },
        filters,
      ),
    ).toBe(true);
    expect(
      service.passesVehiclePostFilters(
        { name: '2021 Honda Passport', price: 31000, mileage: '79,000 mi', exteriorColor: 'Gray' },
        filters,
      ),
    ).toBe(false);
    expect(
      service.passesVehiclePostFilters(
        { name: '2021 Honda Passport', mileage: '81K mi', exteriorColor: 'Gray' },
        filters,
      ),
    ).toBe(false);
    expect(
      service.passesVehiclePostFilters(
        { name: '2021 Honda Passport', mileage: 75000, exteriorColor: 'White' },
        filters,
      ),
    ).toBe(false);
    expect(
      service.passesVehiclePostFilters(
        { name: '2021 Honda Passport', mileage: 75000, exteriorColor: 'Black' },
        filters,
      ),
    ).toBe(false);
  });
});
