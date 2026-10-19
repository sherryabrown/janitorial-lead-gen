// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SamSection } from './SamSection';
import { RequestReview } from './RequestReview';
const mock = vi.hoisted(() => ({ request: vi.fn(), ack: vi.fn() }));
vi.mock('../../lib/procurement-workflow', () => ({
  workflowRequest: mock.request,
  mutationKey: () => 'sam-stable-key',
  acknowledged: mock.ack,
}));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  mock.request.mockReset();
  mock.ack.mockReset();
});
const props = () => ({
  owner: 'sam-user',
  editing: null,
  onEdited: vi.fn(),
  onRun: vi.fn(),
  onChanged: vi.fn(),
  onViewLeads: vi.fn(),
});
it('confirms a separate SAM request without a county selection or provider call on mount', async () => {
  const p = props();
  mock.request.mockImplementation(async (path, options) =>
    path.endsWith('/preview')
      ? { config: options.body, preview_hash: 'sam-hash' }
      : { trigger_id: 'sam-parent' },
  );
  render(<SamSection {...p} />);
  expect(mock.request).not.toHaveBeenCalled();
  expect(screen.queryByText('Forecasts')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Run SAM now' }));
  await screen.findByText('Confirm statewide SAM opportunities');
  expect(mock.request.mock.calls[0][1].body).toMatchObject({
    target_kind: 'sam',
    requested_categories: ['opportunity'],
  });
  expect(mock.request.mock.calls[0][1].body.county_ids).toBeUndefined();
  expect(p.onRun).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm SAM run' }));
  await act(async () => {});
  expect(p.onRun).toHaveBeenCalledWith('sam-parent');
  expect(mock.ack).toHaveBeenCalledWith('sam-user', 'sam:run:new');
  expect(mock.request.mock.calls[1][1].key).toBe('sam-stable-key');
});
it('reuses schedule fields for multiple daily times and saves a paused rolling award schedule', async () => {
  mock.request.mockImplementation(async (path, options) =>
    path.endsWith('/preview')
      ? {
          config: {
            ...options.body.config,
            publication_window: { from: '2026-09-20', to: '2026-10-19' },
          },
          preview_hash: 'schedule-hash',
        }
      : { name: 'SAM award updates', enabled: false },
  );
  render(<SamSection {...props()} />);
  fireEvent.change(screen.getByLabelText('Look for'), {
    target: { value: 'award' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save SAM schedule' }));
  fireEvent.change(screen.getByLabelText('Schedule name'), {
    target: { value: 'SAM award updates' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add time' }));
  fireEvent.change(screen.getByLabelText('Local time 2'), {
    target: { value: '14:00' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Review SAM schedule' }),
  );
  await screen.findByText('Confirm statewide SAM contract awards');
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm SAM schedule' }),
  );
  await act(async () => {});
  expect(mock.request.mock.calls[1][1].body).toMatchObject({
    enabled: false,
    config: { target_kind: 'sam', requested_categories: ['award'] },
    window_policy: { award: { lookback_days: 30 } },
    recurrence: { frequency: 'daily', local_times: ['09:00', '14:00'] },
  });
});
it('restores the independent manual SAM draft and exposes original requests without fake parents', async () => {
  const p = props();
  mock.request.mockResolvedValue({
    items: [
      {
        request_id: 'legacy',
        category: 'award',
        created_at: '2026-10-19T00:00:00Z',
        state: 'blocked',
        stage: 'sam_review',
        parent_trigger_id: 'real-parent',
      },
    ],
    next_offset: null,
  });
  const first = render(<SamSection {...p} />);
  fireEvent.change(screen.getByLabelText('Look for'), {
    target: { value: 'award' },
  });
  first.unmount();
  render(<SamSection {...p} />);
  expect((screen.getByLabelText('Look for') as HTMLSelectElement).value).toBe(
    'award',
  );
  fireEvent.click(screen.getByText('SAM history'));
  fireEvent.click(screen.getByRole('button', { name: 'Load SAM requests' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'View SAM results' }),
  );
  expect(p.onRun).toHaveBeenCalledWith('real-parent');
});
it('SAM import preparation binds saved runs and requires explicit partial evidence review', async () => {
  mock.request.mockImplementation(async (path) =>
    path.endsWith('/packet')
      ? {
          request_id: 'sam-request',
          run_ids: ['run-a'],
          partial: true,
          terminal_confirmed: false,
          candidates: [],
          captures: [],
          next_action: 'Review partial saved pages',
        }
      : path === '/v1/requests/sam-request'
        ? {
            tasks: [],
            jobs: [],
            candidates: [
              {
                intake_id: 'intake-a',
                intake_hash: 'payload-hash',
                title: 'Janitorial contract',
                state: 'pending_review',
              },
            ],
            total_candidates: 1,
            next_offset: null,
          }
        : path.endsWith('/prepare')
          ? { job_id: 'import-job' }
          : {
              job_id: 'import-job',
              stage: 'import_prepare',
              state: 'pending',
            },
  );
  render(
    <RequestReview
      id="sam-request"
      owner="sam-user"
      sam
      onViewLeads={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole('checkbox', { name: /Janitorial contract/ }),
  );
  fireEvent.change(
    screen.getByLabelText('Reason for processing reviewed candidates'),
    { target: { value: 'Reviewed saved work-site and dates' } },
  );
  const prepare = screen.getByRole('button', {
    name: /Prepare tested import/,
  });
  expect((prepare as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: /Review these saved partial SAM pages only/,
    }),
  );
  expect((prepare as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(prepare);
  await act(async () => {});
  const body = mock.request.mock.calls.find((c) =>
    c[0].endsWith('/prepare'),
  )?.[1].body;
  expect(body).toMatchObject({
    run_ids: ['run-a'],
    allow_partial: true,
    decisions: [{ intake_id: 'intake-a', intake_hash: 'payload-hash' }],
  });
  expect(
    within(screen.getByRole('region', { name: 'Saved results' })).queryByText(
      'Imported successfully',
    ),
  ).toBeNull();
});
