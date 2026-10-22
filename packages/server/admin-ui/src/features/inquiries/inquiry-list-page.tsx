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
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FilterX,
  Mail,
  MailOpen,
  MoonStar,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { ADMIN_PAGE_SIZE } from '../../../../src/features/admin-api/admin-query.ts';
import type {
  AdminListColumn,
  AdminSubmissionSummary,
} from '../../../../src/features/admin-api/admin-routes.ts';
import { EMAIL_SEARCH_MAX_LENGTH } from '../../../../src/features/submissions/submission-view.ts';
import { ApiError } from '../../shared/api/api-client.ts';
import { errorMessage } from '../../shared/api/error-message.ts';
import { useAsync } from '../../shared/api/use-async.ts';
import {
  formatDateTime,
  formatListDate,
  formatNumber,
  pageRange,
} from '../../shared/i18n/format.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Button, buttonVariants } from '../../shared/ui/button.tsx';
import { Card } from '../../shared/ui/card.tsx';
import { cn } from '../../shared/ui/cn.ts';
import {
  useElementWidth,
  useScrollEdges,
} from '../../shared/ui/horizontal-scroll.ts';
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
import { Notice } from '../../shared/ui/notice.tsx';
import { Skeleton } from '../../shared/ui/skeleton.tsx';
import { Spinner } from '../../shared/ui/spinner.tsx';
import { Tabs, TabsList, TabsPanel, TabsTab } from '../../shared/ui/tabs.tsx';
import { showToast } from '../../shared/ui/toast.tsx';
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
  updateInquiry,
  type ListQuery,
} from './inquiries-api.ts';
import { LIST_VIEWS, listQuery, listSearch } from './list-search.ts';
import { StatusBadge, SuspectedSpamBadge } from './status-badge.tsx';

const listRoute = getRouteApi('/signed-in/');

// The API returns pages of ADMIN_PAGE_SIZE. The type keeps the two equal
// without bundling server code.
const PAGE_SIZE: typeof ADMIN_PAGE_SIZE = 50;

// Sorting (by received time only), paging, and filtering are server-side:
// the API returns one page in the requested order. The table owns the
// column model and visibility.
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

const buildColumns = (fields: readonly AdminListColumn[]) =>
  columnHelper.columns([
    columnHelper.accessor('createdAt', {
      id: 'received_at',
      enableHiding: false,
    }),
    columnHelper.accessor('email', {
      id: 'email',
      enableHiding: false,
      enableSorting: false,
    }),
    columnHelper.accessor('status', {
      id: 'status',
      enableHiding: false,
      enableSorting: false,
    }),
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

/**
 * Keeps the received and email columns in view from the `md` breakpoint
 * while the other columns scroll. The email column casts a shadow once the
 * table is scrolled, so the hidden content behind it is visible.
 */
const stickyClass = (id: string, scrolled: boolean): string | undefined => {
  if (id === 'received_at') return 'md:sticky md:left-0 md:z-10';
  if (id === 'email') {
    return cn('md:sticky md:z-10', scrolled && 'md:shadow-(--shadow-sticky)');
  }
  return undefined;
};

/** Places the sticky email column right after the received column. */
const stickyStyle = (
  id: string,
  firstColumnWidth: number,
): CSSProperties | undefined =>
  id === 'email' ? { left: firstColumnWidth } : undefined;

/** The received column header: switches between newest and oldest first. */
const SortHeader = ({ label, query }: { label: string; query: ListQuery }) => {
  const { t } = useI18n();
  const asc = query.dir === 'asc';
  const Icon = asc ? ArrowUp : ArrowDown;
  return (
    <Link
      to='/'
      search={listSearch({ ...query, page: 1, dir: asc ? 'desc' : 'asc' })}
      aria-label={t('list.sortToggle', {
        order: asc ? t('list.sortOldest') : t('list.sortNewest'),
        next: asc ? t('list.sortNewest') : t('list.sortOldest'),
      })}
      data-testid='sort-received'
      className='-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 whitespace-nowrap outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring'
    >
      {label}
      <Icon aria-hidden='true' className='size-3.5 text-foreground' />
    </Link>
  );
};

/** The email search: one input, a partial match on the address only. */
const EmailSearch = ({
  term,
  onSearch,
}: {
  term: string;
  onSearch: (term: string | undefined) => void;
}) => {
  const { t } = useI18n();
  // The parent remounts this with a new `key` when the term changes.
  const [draft, setDraft] = useState(term);
  return (
    <form
      role='search'
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(draft.trim() || undefined);
      }}
      className='flex min-w-0 items-center gap-2'
    >
      <div className='relative min-w-0 flex-1 sm:w-72 sm:flex-none'>
        <Search
          aria-hidden='true'
          className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
        />
        <input
          type='search'
          name='q'
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={EMAIL_SEARCH_MAX_LENGTH}
          aria-label={t('list.search.label')}
          placeholder={t('list.search.placeholder')}
          autoComplete='off'
          spellCheck={false}
          data-testid='email-search'
          className='h-9 w-full rounded-full border border-input bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden'
        />
      </div>
      <Button type='submit' variant='outline' size='sm'>
        {t('list.search.submit')}
      </Button>
      {term ? (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={() => onSearch(undefined)}
          aria-label={t('list.search.clear')}
        >
          <X aria-hidden='true' />
        </Button>
      ) : null}
    </form>
  );
};

/** Marks one inquiry read or unread from the list. */
const ReadToggle = ({
  item,
  onChanged,
}: {
  item: AdminSubmissionSummary;
  onChanged: (next: AdminSubmissionSummary) => void;
}) => {
  const { t } = useI18n();
  const { refreshStatus } = useAdminSession();
  const [busy, setBusy] = useState(false);
  const unread = item.status === 'unread';
  const label = unread ? t('list.markRead') : t('list.markUnread');
  const Icon = unread ? MailOpen : Mail;
  const toggle = async () => {
    setBusy(true);
    try {
      const next = await updateInquiry(item.id, {
        status: unread ? 'read' : 'unread',
      });
      onChanged({ ...item, status: next.status });
      refreshStatus();
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError(0, 'server_error', 'unexpected error');
      showToast(
        `${t('list.markFailed')} ${errorMessage(t, apiError)}`,
        'error',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      title={label}
      aria-label={label}
      data-testid='read-toggle'
      className='size-7 rounded-full px-0 text-muted-foreground hover:text-foreground'
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation();
        void toggle();
      }}
    >
      {busy ? <Spinner /> : <Icon aria-hidden='true' />}
    </Button>
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
 * The inquiry list: one segmented control for the views (unread, read, all,
 * suspected spam), a search on the email address, filters by form version
 * and by a select or radio answer, a table with the fixed columns and the
 * current form's fields (visible columns chosen per browser), order by
 * received time, a read/unread switch per row, 50 per page, and CSV export.
 * Suspected spam appears only in its own view. Filters, order, and page live
 * in the URL, so the back button and reloads keep them.
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
    { id: 'received_at', desc: query.dir === 'desc' },
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
  // The counts on the view tabs stay while the next page loads.
  const [counts, setCounts] = useState<{ unread: number; spam: number }>();
  if (
    data &&
    (counts?.unread !== data.unreadCount ||
      counts.spam !== data.suspectedSpamCount)
  ) {
    setCounts({ unread: data.unreadCount, spam: data.suspectedSpamCount });
  }
  // The row changes at once; the page is then loaded again in the
  // background, so the view, totals, and counts follow without a skeleton.
  const itemChanged = (next: AdminSubmissionSummary) => {
    if (!data) return;
    list.setData({
      ...data,
      items: data.items.map((item) => (item.id === next.id ? next : item)),
    });
    list.refresh();
  };

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
  // The view is not a filter: each view has its own empty state.
  const filtered = query.version !== undefined || !!query.field || !!query.q;

  const rows = table.getRowModel().rows;
  const [scrollerRef, edges] = useScrollEdges();
  const [firstHeaderRef, firstColumnWidth] = useElementWidth();
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
    const unread = item.status === 'unread';
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
            title={item.email}
            className={cn(
              'block max-w-56 truncate rounded-sm outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring',
              unread ? 'font-bold' : 'font-medium',
            )}
          >
            {item.email}
          </Link>
        );
      case 'status':
        return (
          <span className='flex items-start gap-1'>
            <span className='flex flex-col items-start gap-1.5'>
              <StatusBadge status={item.status} />
              {item.suspectedSpam ? <SuspectedSpamBadge /> : null}
            </span>
            <ReadToggle item={item} onChanged={itemChanged} />
          </span>
        );
      default: {
        const value = item.fields[id];
        if (!value) {
          return <span className='text-muted-foreground'>—</span>;
        }
        const column = fieldColumns.find((entry) => entry.id === id);
        const long = column?.type === 'textarea';
        return (
          <span
            className={cn(
              'block break-words',
              long
                ? 'line-clamp-2 min-w-60 max-w-xs text-muted-foreground'
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
                {query.dir === 'asc'
                  ? t('list.sortOldest')
                  : t('list.sortNewest')}
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
        value={query.view}
        onValueChange={(value: unknown) => {
          const next = LIST_VIEWS.find((view) => view === value);
          if (next) go({ view: next });
        }}
        className='flex flex-col gap-4'
      >
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0'>
            <TabsList aria-label={t('list.filterLabel')}>
              {LIST_VIEWS.map((view) => {
                const count =
                  view === 'unread'
                    ? counts?.unread
                    : view === 'spam'
                      ? counts?.spam
                      : undefined;
                return (
                  <TabsTab key={view} value={view} data-view={view}>
                    {view === 'spam' ? (
                      <ShieldAlert aria-hidden='true' className='size-4' />
                    ) : null}
                    {t(`list.view.${view}`)}
                    {count !== undefined && count > 0 ? (
                      <span
                        data-testid={`view-count-${view}`}
                        className={cn(
                          'min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tabular-nums',
                          view === 'spam'
                            ? 'bg-warning-soft text-warning-foreground'
                            : 'bg-primary text-primary-foreground in-data-active:bg-primary-foreground in-data-active:text-primary',
                        )}
                      >
                        {formatNumber(count, locale)}
                      </span>
                    ) : null}
                  </TabsTab>
                );
              })}
            </TabsList>
          </div>
          <EmailSearch
            key={query.q ?? ''}
            term={query.q ?? ''}
            onSearch={(q) => {
              setPendingField(null);
              go({ q });
            }}
          />
        </div>
        <TabsPanel value={query.view} className='flex flex-col gap-4'>
          {query.view === 'spam' ? (
            <Notice
              tone='warning'
              icon={<ShieldAlert aria-hidden='true' />}
              data-testid='spam-view-hint'
            >
              <p>{t('list.spamViewHint')}</p>
            </Notice>
          ) : (
            <p
              data-testid='spam-hint'
              className='flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-muted/70 px-4 py-2.5 text-[0.8125rem] leading-relaxed text-muted-foreground'
            >
              <ShieldAlert aria-hidden='true' className='size-4 shrink-0' />
              <span>{t('list.spamHint')}</span>
              <Link
                to='/'
                search={listSearch({ view: 'spam' })}
                className='rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring'
              >
                {t('list.spamHintLink', {
                  count: formatNumber(counts?.spam ?? 0, locale),
                })}
              </Link>
            </p>
          )}
          {query.q ? (
            <p
              className='text-sm text-muted-foreground'
              data-testid='search-active'
            >
              {t('list.search.active', { term: query.q })}
            </p>
          ) : null}
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
                search={listSearch({ view: query.view, dir: query.dir })}
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
                    {filtered || query.page !== 1
                      ? t('list.emptyFiltered')
                      : query.view === 'all'
                        ? t('admin.empty')
                        : t(`list.empty.${query.view}`)}
                  </p>
                  {query.view === 'all' ? (
                    <p className='max-w-sm text-sm text-muted-foreground'>
                      {t('list.emptyHint')}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className='relative'>
                  <div
                    ref={scrollerRef}
                    role='region'
                    aria-label={t('list.tableRegion')}
                    tabIndex={edges.before || edges.after ? 0 : undefined}
                    data-testid='inquiry-table-scroll'
                    className='peer overflow-x-auto outline-none'
                  >
                    <table className='w-full border-separate border-spacing-0 text-left text-sm'>
                      <caption className='sr-only'>{t('list.title')}</caption>
                      <thead className='text-xs font-semibold text-muted-foreground'>
                        <tr className='[--row-bg:var(--color-table-header)]'>
                          {visibleColumns.map((column, index) => (
                            <th
                              key={column.id}
                              ref={index === 0 ? firstHeaderRef : undefined}
                              scope='col'
                              aria-sort={
                                column.id === 'received_at'
                                  ? query.dir === 'asc'
                                    ? 'ascending'
                                    : 'descending'
                                  : undefined
                              }
                              style={stickyStyle(column.id, firstColumnWidth)}
                              className={cn(
                                'border-b border-border/80 bg-(--row-bg) px-4 py-3 whitespace-nowrap first:pl-5 sm:first:pl-6',
                                stickyClass(column.id, edges.before),
                              )}
                            >
                              {column.id === 'received_at' ? (
                                <SortHeader
                                  label={columnLabel(column.id)}
                                  query={query}
                                />
                              ) : (
                                columnLabel(column.id)
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
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
                              'group/row cursor-pointer align-top [--row-bg:var(--color-card)] hover:[--row-bg:var(--color-table-row-hover)]',
                              row.original.status === 'unread' &&
                                '[--row-bg:var(--color-table-row-unread)]',
                            )}
                          >
                            {row.getVisibleCells().map((visible) => (
                              <td
                                key={visible.id}
                                style={stickyStyle(
                                  visible.column.id,
                                  firstColumnWidth,
                                )}
                                className={cn(
                                  'border-border/70 bg-(--row-bg) px-4 py-3.5 transition-colors first:pl-5 sm:first:pl-6 group-not-last/row:border-b',
                                  stickyClass(visible.column.id, edges.before),
                                )}
                              >
                                {cell(visible.column.id, row.original)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* The focus ring sits above the sticky columns. */}
                  <div
                    aria-hidden='true'
                    className='pointer-events-none absolute inset-0 z-20 rounded-2xl ring-ring ring-inset peer-focus-visible:ring-2'
                  />
                  <div
                    aria-hidden='true'
                    className={cn(
                      'pointer-events-none absolute inset-y-0 left-0 w-10 bg-linear-to-r from-card to-transparent transition-opacity md:hidden',
                      edges.before ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <div
                    aria-hidden='true'
                    data-testid='inquiry-table-more'
                    data-visible={edges.after}
                    className={cn(
                      'pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-card to-transparent transition-opacity',
                      edges.after ? 'opacity-100' : 'opacity-0',
                    )}
                  />
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
