import { Link, getRouteApi, useNavigate } from '@tanstack/react-router';
import {
  columnVisibilityFeature,
  createColumnHelper,
  functionalUpdate,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnVisibilityState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FilterX,
  MoonStar,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ADMIN_PAGE_SIZE } from '../../../../src/features/admin-api/admin-query.ts';
import type {
  AdminListColumn,
  AdminSubmissionSummary,
} from '../../../../src/features/admin-api/admin-routes.ts';
import type { SubmissionSortColumn } from '../../../../src/features/submissions/submission-sort.ts';
import { errorMessage } from '../../shared/api/error-message.ts';
import { useAsync } from '../../shared/api/use-async.ts';
import {
  formatDateTime,
  formatListDate,
  formatNumber,
  pageRange,
} from '../../shared/i18n/format.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { buttonVariants } from '../../shared/ui/button.tsx';
import { Card } from '../../shared/ui/card.tsx';
import { cn } from '../../shared/ui/cn.ts';
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuTrigger,
} from '../../shared/ui/menu.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../shared/ui/select.tsx';
import { Skeleton } from '../../shared/ui/skeleton.tsx';
import { Tabs, TabsList, TabsPanel, TabsTab } from '../../shared/ui/tabs.tsx';
import {
  useAdminSession,
  useSignInOnUnauthorized,
} from '../auth/admin-session.tsx';
import { PageError } from '../layout/page-states.tsx';
import { SetupNotices } from '../layout/setup-notices.tsx';
import {
  columnVisibility,
  readColumnChoices,
  storeColumnChoices,
  type ColumnChoices,
} from './column-visibility.ts';
import { fieldValueText, labelText } from './field-value.ts';
import {
  csvExportUrl,
  fetchInquiries,
  type ListQuery,
} from './inquiries-api.ts';
import { STATUS_FILTERS, listQuery, listSearch } from './list-search.ts';
import { StatusBadge } from './status-badge.tsx';

const listRoute = getRouteApi('/signed-in/');

// The API returns pages of ADMIN_PAGE_SIZE. The type keeps the two equal
// without bundling server code.
const PAGE_SIZE: typeof ADMIN_PAGE_SIZE = 50;

// Sorting, paging, and filtering are server-side: the API returns one page
// in the requested order. The table owns the column model and visibility.
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
});
const columnHelper = createColumnHelper<
  typeof features,
  AdminSubmissionSummary
>();
const NO_ROWS: AdminSubmissionSummary[] = [];
const NO_COLUMNS: AdminListColumn[] = [];

/** Fixed columns that can be sorted on, by table column id. */
const SORTABLE: readonly SubmissionSortColumn[] = [
  'received_at',
  'email',
  'status',
];

const isSortable = (id: string): id is SubmissionSortColumn =>
  (SORTABLE as readonly string[]).includes(id);

const buildColumns = (fields: readonly AdminListColumn[]) =>
  columnHelper.columns([
    columnHelper.accessor('createdAt', {
      id: 'received_at',
      enableHiding: false,
    }),
    columnHelper.accessor('email', { id: 'email', enableHiding: false }),
    columnHelper.accessor('status', { id: 'status', enableHiding: false }),
    ...fields.map((field) =>
      columnHelper.accessor((row) => row.fields[field.id], {
        id: field.id,
        enableSorting: false,
      }),
    ),
  ]);

const ListSkeleton = () => (
  <div aria-hidden='true' className='flex flex-col divide-y divide-border/70'>
    {['a', 'b', 'c', 'd', 'e'].map((key) => (
      <div key={key} className='flex items-center gap-6 px-6 py-4'>
        <Skeleton className='h-3.5 w-16' />
        <Skeleton className='h-3.5 w-44' />
        <Skeleton className='h-5 w-16 rounded-full' />
        <Skeleton className='h-3.5 flex-1' />
      </div>
    ))}
  </div>
);

const SortHeader = ({
  label,
  column,
  query,
}: {
  label: string;
  column: SubmissionSortColumn;
  query: ListQuery;
}) => {
  const { t } = useI18n();
  const active = query.sort === column;
  const next: ListQuery = {
    ...query,
    page: 1,
    sort: column,
    dir: active
      ? query.dir === 'asc'
        ? 'desc'
        : 'asc'
      : column === 'received_at'
        ? 'desc'
        : 'asc',
  };
  const Icon = active
    ? query.dir === 'asc'
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  return (
    <Link
      to='/'
      search={listSearch(next)}
      aria-label={t('list.sortBy', { column: label })}
      className='-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 whitespace-nowrap outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60'
    >
      {label}
      <Icon
        aria-hidden='true'
        className={cn('size-3.5', active ? 'text-foreground' : 'opacity-50')}
      />
    </Link>
  );
};

const FilterSelect = ({
  label,
  value,
  items,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
  testId: string;
}) => (
  <Select
    items={items}
    value={value}
    onValueChange={(next: unknown) => {
      if (typeof next === 'string') onChange(next);
    }}
  >
    <SelectTrigger
      aria-label={label}
      data-testid={testId}
      className='h-9 w-auto min-w-36 rounded-full text-sm'
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {items.map((item) => (
        <SelectItem key={item.value} value={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/**
 * The inquiry list: status tabs, filters by form version and by a select or
 * radio answer, a table with the fixed columns and the current form's fields
 * (visible columns chosen per browser), server-side sorting on the fixed
 * columns, 50 per page, and CSV export. Filters, order, and page live in the
 * URL, so the back button and reloads keep them. There is no keyword search.
 */
export const InquiryListPage = () => {
  const { locale, t } = useI18n();
  const { setUnreadCount } = useAdminSession();
  const navigate = useNavigate();
  const search = listRoute.useSearch();
  const query = listQuery(search);
  const list = useAsync(() => fetchInquiries(query), JSON.stringify(query));
  useSignInOnUnauthorized(list.status === 'error' ? list.error : null);

  const data = list.status === 'success' ? list.data : null;
  const fieldColumns = data?.columns ?? NO_COLUMNS;
  const columns = useMemo(() => buildColumns(fieldColumns), [fieldColumns]);
  const [choices, setChoices] = useState<ColumnChoices>(readColumnChoices);
  const visibility = columnVisibility(fieldColumns, choices);
  const sorting: SortingState = [
    { id: query.sort, desc: query.dir === 'desc' },
  ];

  const table = useTable({
    features,
    columns,
    data: data?.items ?? NO_ROWS,
    getRowId: (item) => item.id,
    manualSorting: true,
    manualPagination: true,
    rowCount: data?.total,
    state: {
      sorting,
      pagination: { pageIndex: query.page - 1, pageSize: PAGE_SIZE },
      columnVisibility: visibility,
    },
    onColumnVisibilityChange: (updater: Updater<ColumnVisibilityState>) => {
      const next = functionalUpdate(updater, visibility);
      const updated = { ...choices };
      for (const column of fieldColumns) {
        if (column.id in next) updated[column.id] = next[column.id] === true;
      }
      setChoices(updated);
      storeColumnChoices(updated);
    },
  });

  const unreadFromList = data ? data.unreadCount : null;
  useEffect(() => {
    if (unreadFromList !== null) setUnreadCount(unreadFromList);
  }, [unreadFromList, setUnreadCount]);

  const go = (next: Partial<ListQuery>) =>
    void navigate({
      to: '/',
      search: listSearch({ ...query, page: 1, ...next }),
    });

  // A field picked in the filter before its answer is chosen.
  const [pendingField, setPendingField] = useState<string | null>(null);
  const choiceColumns = fieldColumns.filter((column) => column.options);
  const filterField = pendingField ?? query.field ?? '';
  const filterColumn = choiceColumns.find(
    (column) => column.id === filterField,
  );
  const filtered =
    query.status !== 'all' || query.version !== undefined || !!query.field;

  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const range = data ? pageRange(data.page, data.pageSize, data.total) : null;
  const columnLabel = (id: string): string => {
    if (id === 'received_at') return t('list.col.receivedAt');
    if (id === 'email') return t('field.email');
    if (id === 'status') return t('list.col.status');
    const column = fieldColumns.find((entry) => entry.id === id);
    return labelText(column?.label, locale, id);
  };

  const cell = (id: string, item: AdminSubmissionSummary): ReactNode => {
    const unread = item.status === 'new';
    switch (id) {
      case 'received_at':
        return (
          <span className='flex items-center gap-2.5'>
            <span className='flex w-2 shrink-0 justify-center'>
              {unread ? (
                <span className='size-2 rounded-full bg-primary'>
                  <span className='sr-only'>{t('list.unreadMark')}</span>
                </span>
              ) : null}
            </span>
            <time
              dateTime={new Date(item.createdAt).toISOString()}
              title={formatDateTime(item.createdAt, locale)}
              className='whitespace-nowrap text-muted-foreground tabular-nums'
            >
              {formatListDate(item.createdAt, locale)}
            </time>
          </span>
        );
      case 'email':
        return (
          <Link
            to='/inquiries/$id'
            params={{ id: item.id }}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'rounded-sm break-all outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/60',
              unread ? 'font-bold' : 'font-medium',
            )}
          >
            {item.email}
          </Link>
        );
      case 'status':
        return <StatusBadge status={item.status} />;
      default: {
        const value = item.fields[id];
        if (!value) {
          return <span className='text-muted-foreground/60'>—</span>;
        }
        const column = fieldColumns.find((entry) => entry.id === id);
        const long = column?.type === 'textarea';
        return (
          <span
            className={cn(
              'block break-words',
              long
                ? 'line-clamp-2 min-w-56 max-w-sm text-muted-foreground'
                : 'max-w-60 truncate',
              unread && !long && 'font-semibold',
            )}
            title={long ? undefined : fieldValueText(value, locale)}
          >
            {fieldValueText(value, locale)}
          </span>
        );
      }
    }
  };

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
              : ' '}
            {data && data.total > 1 ? (
              <span>
                {' · '}
                {t('list.sortedBy', {
                  column: columnLabel(query.sort),
                  direction:
                    query.dir === 'asc'
                      ? t('list.ascending')
                      : t('list.descending'),
                })}
              </span>
            ) : null}
          </p>
        </div>
        <a
          href={csvExportUrl(query, locale)}
          download
          title={t('list.exportHint')}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Download aria-hidden='true' />
          {t('admin.export')}
        </a>
      </div>

      <Tabs
        value={query.status}
        onValueChange={(value: unknown) => {
          const next = STATUS_FILTERS.find((filter) => filter === value);
          if (next) go({ status: next });
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
        <TabsPanel value={query.status} className='flex flex-col gap-4'>
          <div className='flex flex-wrap items-center gap-2'>
            {data ? (
              <FilterSelect
                label={t('list.versionFilter')}
                testId='version-filter'
                value={query.version ? String(query.version) : ''}
                items={[
                  { value: '', label: t('list.allVersions') },
                  ...Array.from({ length: data.formVersion }, (_, i) => {
                    const version = data.formVersion - i;
                    return {
                      value: String(version),
                      label: t('form.version', { version }),
                    };
                  }),
                ]}
                onChange={(value) =>
                  go({ version: value ? Number(value) : undefined })
                }
              />
            ) : null}
            {choiceColumns.length > 0 ? (
              <FilterSelect
                label={t('list.fieldFilter')}
                testId='field-filter'
                value={filterField}
                items={[
                  { value: '', label: t('list.fieldFilterNone') },
                  ...choiceColumns.map((column) => ({
                    value: column.id,
                    label: labelText(column.label, locale, column.id),
                  })),
                ]}
                onChange={(value) => {
                  if (value === '') {
                    setPendingField(null);
                    go({ field: undefined, value: undefined });
                  } else setPendingField(value);
                }}
              />
            ) : null}
            {filterColumn?.options ? (
              <FilterSelect
                label={t('list.valueFilter')}
                testId='value-filter'
                value={filterField === query.field ? (query.value ?? '') : ''}
                items={[
                  { value: '', label: t('list.valueFilter') },
                  ...filterColumn.options.map((option) => ({
                    value: option.value,
                    label: labelText(option.label, locale, option.value),
                  })),
                ]}
                onChange={(value) => {
                  setPendingField(null);
                  if (value) go({ field: filterColumn.id, value });
                }}
              />
            ) : null}
            {filtered ? (
              <Link
                to='/'
                search={listSearch({ sort: query.sort, dir: query.dir })}
                onClick={() => setPendingField(null)}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                <FilterX aria-hidden='true' />
                {t('list.clearFilters')}
              </Link>
            ) : null}
            {fieldColumns.length > 0 ? (
              <Menu>
                <MenuTrigger
                  aria-label={t('list.columnsLabel')}
                  data-testid='columns-menu'
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'ml-auto',
                  )}
                >
                  <Columns3 aria-hidden='true' />
                  {t('list.columns')}
                </MenuTrigger>
                <MenuContent className='max-h-80 overflow-y-auto'>
                  {table
                    .getAllLeafColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => (
                      <MenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={(checked: boolean) =>
                          column.toggleVisibility(checked)
                        }
                      >
                        {columnLabel(column.id)}
                      </MenuCheckboxItem>
                    ))}
                </MenuContent>
              </Menu>
            ) : null}
          </div>

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
                    {!filtered && query.page === 1
                      ? t('admin.empty')
                      : t('list.emptyFiltered')}
                  </p>
                  <p className='max-w-sm text-sm text-muted-foreground'>
                    {t('list.emptyHint')}
                  </p>
                </div>
              ) : (
                <div className='overflow-x-auto'>
                  <table className='w-full text-left text-sm'>
                    <caption className='sr-only'>{t('list.title')}</caption>
                    <thead className='border-b border-border/80 bg-muted/50 text-xs font-semibold text-muted-foreground'>
                      <tr>
                        {visibleColumns.map((column) => (
                          <th
                            key={column.id}
                            scope='col'
                            aria-sort={
                              query.sort === column.id
                                ? query.dir === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : undefined
                            }
                            className='px-4 py-3 whitespace-nowrap first:pl-5 sm:first:pl-6'
                          >
                            {isSortable(column.id) ? (
                              <SortHeader
                                label={columnLabel(column.id)}
                                column={column.id}
                                query={query}
                              />
                            ) : (
                              columnLabel(column.id)
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-border/70'>
                      {rows.map((row) => (
                        <tr
                          key={row.id}
                          data-testid='inquiry-row'
                          onClick={() =>
                            void navigate({
                              to: '/inquiries/$id',
                              params: { id: row.original.id },
                            })
                          }
                          className={cn(
                            'cursor-pointer align-top transition-colors hover:bg-muted/70',
                            row.original.status === 'new' && 'bg-accent/30',
                          )}
                        >
                          {row.getVisibleCells().map((visible) => (
                            <td
                              key={visible.id}
                              className='px-4 py-3.5 first:pl-5 sm:first:pl-6'
                            >
                              {cell(visible.column.id, row.original)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                    query={{ ...query, page: query.page - 1 }}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <ChevronLeft aria-hidden='true' />
                    {t('list.previous')}
                  </PageLink>
                  <PageLink
                    query={{ ...query, page: query.page + 1 }}
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
  query,
  disabled,
  children,
}: {
  query: ListQuery;
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
      search={listSearch(query)}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      {children}
    </Link>
  );
