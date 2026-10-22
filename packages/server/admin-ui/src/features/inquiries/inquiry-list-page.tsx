import { Link, getRouteApi, useNavigate } from '@tanstack/react-router';
import {
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Download, MoonStar } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import type {
  ADMIN_PAGE_SIZE,
  AdminSubmissionSummary,
} from '../../../../src/features/admin-api/admin-routes.ts';
import { errorMessage } from '../../shared/api/error-message.ts';
import { useAsync } from '../../shared/api/use-async.ts';
import {
  formatDateTime,
  formatListDate,
  formatNumber,
  pageRange,
} from '../../shared/i18n/format.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Badge } from '../../shared/ui/badge.tsx';
import { buttonVariants } from '../../shared/ui/button.tsx';
import { Card } from '../../shared/ui/card.tsx';
import { cn } from '../../shared/ui/cn.ts';
import { Skeleton } from '../../shared/ui/skeleton.tsx';
import { Tabs, TabsList, TabsPanel, TabsTab } from '../../shared/ui/tabs.tsx';
import {
  useAdminSession,
  useSignInOnUnauthorized,
} from '../auth/admin-session.tsx';
import { PageError } from '../layout/page-states.tsx';
import { SetupNotices } from '../layout/setup-notices.tsx';
import { categoryLabel } from './category-label.ts';
import {
  csvExportUrl,
  fetchInquiries,
  type StatusFilter,
} from './inquiries-api.ts';
import { STATUS_FILTERS, listSearch, type ListSearch } from './list-search.ts';
import { StatusBadge } from './status-badge.tsx';

const listRoute = getRouteApi('/signed-in/');

// The API returns pages of ADMIN_PAGE_SIZE. The type keeps the two equal
// without bundling server code.
const PAGE_SIZE: typeof ADMIN_PAGE_SIZE = 50;

// The table owns the page model and the sort order. Both are server-side:
// the API returns one page, sorted by received date, newest first. It has no
// other order, so the sort is fixed.
const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });
const columnHelper = createColumnHelper<
  typeof features,
  AdminSubmissionSummary
>();
const columns = columnHelper.columns([
  columnHelper.accessor('createdAt', { id: 'receivedAt' }),
  columnHelper.accessor('name', { enableSorting: false }),
  columnHelper.accessor('status', { enableSorting: false }),
]);
const SORTING: SortingState = [{ id: 'receivedAt', desc: true }];
const NO_ROWS: AdminSubmissionSummary[] = [];

const InquiryRow = ({ item }: { item: AdminSubmissionSummary }) => {
  const { locale, t } = useI18n();
  const { status } = useAdminSession();
  const unread = item.status === 'new';
  return (
    <li>
      <Link
        to='/inquiries/$id'
        params={{ id: item.id }}
        data-testid='inquiry-row'
        className='group flex gap-3 px-4 py-4 transition-colors outline-none hover:bg-muted/70 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:gap-4 sm:px-6'
      >
        <span className='flex w-2 shrink-0 justify-center pt-2.5'>
          {unread ? (
            <span className='size-2 rounded-full bg-primary'>
              <span className='sr-only'>{t('list.unreadMark')}</span>
            </span>
          ) : null}
        </span>
        <div className='flex min-w-0 flex-1 flex-col gap-1'>
          <div className='flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5'>
            <span
              className={cn(
                'truncate text-[0.98rem] group-hover:text-primary',
                unread ? 'font-bold' : 'font-semibold',
              )}
            >
              {item.name}
            </span>
            {item.company ? (
              <span className='truncate text-sm text-muted-foreground'>
                {item.company}
              </span>
            ) : null}
            {item.category ? (
              <Badge tone='outline' className='self-center'>
                {categoryLabel(item.category, status?.categories, locale)}
              </Badge>
            ) : null}
          </div>
          <p className='line-clamp-2 text-sm leading-relaxed text-muted-foreground sm:line-clamp-1'>
            {item.excerpt}
          </p>
        </div>
        <div className='flex shrink-0 flex-col items-end gap-2'>
          <time
            dateTime={new Date(item.createdAt).toISOString()}
            title={formatDateTime(item.createdAt, locale)}
            className='text-xs whitespace-nowrap text-muted-foreground tabular-nums'
          >
            {formatListDate(item.createdAt, locale)}
          </time>
          <StatusBadge status={item.status} />
        </div>
      </Link>
    </li>
  );
};

const ListSkeleton = () => (
  <ul aria-hidden='true' className='divide-y divide-border/70'>
    {['a', 'b', 'c', 'd', 'e'].map((key) => (
      <li key={key} className='flex gap-4 px-6 py-5'>
        <div className='flex flex-1 flex-col gap-2.5'>
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-3.5 w-full max-w-md' />
        </div>
        <div className='flex flex-col items-end gap-2.5'>
          <Skeleton className='h-3 w-14' />
          <Skeleton className='h-5 w-16 rounded-full' />
        </div>
      </li>
    ))}
  </ul>
);

/**
 * The inquiry list: status tabs, 50 per page, newest first, CSV export, and
 * the setup notices. The filter and page live in the URL (`?status=&page=`),
 * so the back button and reloads keep them.
 */
export const InquiryListPage = () => {
  const { locale, t } = useI18n();
  const { setUnreadCount } = useAdminSession();
  const navigate = useNavigate();
  const search = listRoute.useSearch();
  const status: StatusFilter = search.status ?? 'all';
  const page = search.page ?? 1;
  const list = useAsync(
    () => fetchInquiries(status, page),
    `${status}:${page}`,
  );
  useSignInOnUnauthorized(list.status === 'error' ? list.error : null);

  const data = list.status === 'success' ? list.data : null;
  const table = useTable({
    features,
    columns,
    data: data?.items ?? NO_ROWS,
    getRowId: (item) => item.id,
    manualSorting: true,
    manualPagination: true,
    rowCount: data?.total,
    state: {
      sorting: SORTING,
      pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE },
    },
  });

  const unreadFromList = data ? data.unreadCount : null;
  useEffect(() => {
    if (unreadFromList !== null) setUnreadCount(unreadFromList);
  }, [unreadFromList, setUnreadCount]);

  const rows = table.getRowModel().rows;
  const newestFirst = table.getColumn('receivedAt')?.getIsSorted() === 'desc';
  const range = data ? pageRange(data.page, data.pageSize, data.total) : null;

  return (
    <div className='flex flex-col gap-6'>
      <SetupNotices showSlack />
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div className='flex flex-col gap-1'>
          <h1 className='text-2xl font-bold tracking-tight sm:text-[1.75rem]'>
            {t('list.title')}
          </h1>
          <p className='text-sm text-muted-foreground' aria-live='polite'>
            {data
              ? t('list.total', { count: formatNumber(data.total, locale) })
              : ' '}
            {data && data.total > 1 && newestFirst ? (
              <span> · {t('list.sortNewest')}</span>
            ) : null}
          </p>
        </div>
        <a
          href={csvExportUrl(status)}
          download
          title={t('list.exportHint')}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Download aria-hidden='true' />
          {t('admin.export')}
        </a>
      </div>

      <Tabs
        value={status}
        onValueChange={(value: unknown) => {
          const next = STATUS_FILTERS.find((filter) => filter === value);
          if (next) void navigate({ to: '/', search: listSearch(next) });
        }}
        className='flex flex-col gap-4'
      >
        <div className='-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0'>
          <TabsList aria-label={t('list.filterLabel')}>
            {STATUS_FILTERS.map((filter) => (
              <TabsTab key={filter} value={filter}>
                {filter === 'all'
                  ? t('list.filter.all')
                  : t(`status.${filter}`)}
              </TabsTab>
            ))}
          </TabsList>
        </div>
        <TabsPanel value={status} className='flex flex-col gap-4'>
          {list.status === 'error' ? (
            <PageError
              message={errorMessage(t, list.error)}
              onRetry={list.reload}
            />
          ) : (
            <Card className='overflow-hidden'>
              {list.status === 'loading' ? (
                <>
                  <span role='status' className='sr-only'>
                    {t('app.loading')}
                  </span>
                  <ListSkeleton />
                </>
              ) : rows.length === 0 ? (
                <div className='flex flex-col items-center gap-3 px-6 py-16 text-center'>
                  <div className='flex size-16 items-center justify-center rounded-full bg-accent text-primary'>
                    <MoonStar aria-hidden='true' className='size-7' />
                  </div>
                  <p className='font-semibold'>
                    {status === 'all' && page === 1
                      ? t('admin.empty')
                      : t('list.emptyFiltered')}
                  </p>
                  <p className='max-w-sm text-sm text-muted-foreground'>
                    {t('list.emptyHint')}
                  </p>
                </div>
              ) : (
                <ul className='divide-y divide-border/70'>
                  {rows.map((row) => (
                    <InquiryRow key={row.id} item={row.original} />
                  ))}
                </ul>
              )}
            </Card>
          )}

          {data && range && data.total > 0 ? (
            <nav
              aria-label={t('list.pagination')}
              className='flex flex-wrap items-center justify-between gap-3'
            >
              <p className='text-sm text-muted-foreground tabular-nums'>
                {t('list.range', {
                  from: formatNumber(range.from, locale),
                  to: formatNumber(range.to, locale),
                  total: formatNumber(data.total, locale),
                })}
              </p>
              {table.getPageCount() > 1 ? (
                <div className='flex gap-2'>
                  <PageLink
                    search={listSearch(status, page - 1)}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <ChevronLeft aria-hidden='true' />
                    {t('list.previous')}
                  </PageLink>
                  <PageLink
                    search={listSearch(status, page + 1)}
                    disabled={!table.getCanNextPage()}
                  >
                    {t('list.next')}
                    <ChevronRight aria-hidden='true' />
                  </PageLink>
                </div>
              ) : null}
            </nav>
          ) : null}
        </TabsPanel>
      </Tabs>
    </div>
  );
};

const PageLink = ({
  search,
  disabled,
  children,
}: {
  search: ListSearch;
  disabled: boolean;
  children: ReactNode;
}) =>
  disabled ? (
    <span
      aria-disabled='true'
      className={cn(
        buttonVariants({ variant: 'outline', size: 'sm' }),
        'pointer-events-none opacity-45',
      )}
    >
      {children}
    </span>
  ) : (
    <Link
      to='/'
      search={search}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      {children}
    </Link>
  );
