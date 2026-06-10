import { useEffect, useState, useMemo } from 'react';
import { Card, DatePicker, Row, Col, Statistic, Table, Tag, Typography, Spin, message, Space, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { fetchUdescVotes } from '../../api/udesc';
import type { UdescSessionVote, UdescVoteListResp } from '../../types/udesc';

const { RangePicker } = DatePicker;

export function VotesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UdescVoteListResp | null>(null);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => {
    const end = dayjs();
    const start = end.subtract(30, 'day');
    return [start.startOf('day'), end.endOf('day')];
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [ratingFilter, setRatingFilter] = useState<number | undefined>();
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const [sessionIdSearch, setSessionIdSearch] = useState<string | undefined>();

  const apiRange = useMemo(
    () => ({
      startDateIso: range[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      endDateIso: range[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    }),
    [range],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const resp = await fetchUdescVotes({
        startDate: apiRange.startDateIso,
        endDate: apiRange.endDateIso,
        minRating: ratingFilter,
        maxRating: ratingFilter,
        sortBy,
        sortOrder,
        page,
        pageSize,
        sessionId: sessionIdSearch,
      });
      setData(resp);
    } catch {
      message.error('加载评价数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [apiRange.startDateIso, apiRange.endDateIso, page, pageSize, ratingFilter, sortBy, sortOrder, sessionIdSearch]);

  const columns: ColumnsType<UdescSessionVote> = [
    {
      title: '会话ID',
      dataIndex: 'sessionId',
      width: 120,
      ellipsis: true,
      render: (id: string) => (
        <Typography.Link onClick={() => navigate(`/udesc/sessions?highlightSessionId=${id}`)}>
          {id}
        </Typography.Link>
      ),
    },
    {
      title: '评分',
      dataIndex: 'rating',
      width: 100,
      sorter: true,
      filters: [
        { text: '5分', value: 5 },
        { text: '4分', value: 4 },
        { text: '3分', value: 3 },
        { text: '2分', value: 2 },
        { text: '1分', value: 1 },
      ],
      filterMultiple: false,
      render: (rating: number | null) => rating ?? '-',
    },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 200,
      render: (tags: string[]) => tags?.length > 0 ? tags.map((t) => <Tag key={t}>{t}</Tag>) : '-',
    },
    {
      title: '评价内容',
      dataIndex: 'comment',
      ellipsis: true,
      sorter: true,
      render: (c: string | null) => c || '-',
    },
    {
      title: '评价时间',
      dataIndex: 'votedAt',
      width: 180,
      render: (d: string | null) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '客服',
      dataIndex: 'agentId',
      width: 120,
      render: (id: string | undefined, record: any) => record.agentName || id || '-',
    },
    {
      title: '会话时间',
      dataIndex: 'sessionStartedAt',
      width: 180,
      render: (d: string | undefined) => (d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>评价分析</Typography.Title>
      
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <RangePicker
            value={range}
            onChange={(dates) => dates && setRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
            presets={[
              { label: '近7天', value: () => [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] as [dayjs.Dayjs, dayjs.Dayjs] },
              { label: '近30天', value: () => [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')] as [dayjs.Dayjs, dayjs.Dayjs] },
            ]}
          />
          <Input.Search
            placeholder="搜索会话ID"
            allowClear
            style={{ width: 200 }}
            onSearch={(value) => {
              setSessionIdSearch(value || undefined);
              setPage(1);
            }}
          />
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card>
            <Statistic title="总会话数" value={data?.totalSessions ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="总评价数" value={data?.total ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="平均评分"
              value={data?.avgRating?.toFixed(2) ?? '-'}
              suffix={data?.avgRating ? '星' : ''}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="评分分布">
            <Row gutter={8}>
              {[5, 4, 3, 2, 1].map((r) => (
                <Col key={r} span={4}>
                  <Statistic
                    title={`${r}星`}
                    value={data?.ratingDistribution?.[r] ?? 0}
                  />
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>

      <Card>
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={data?.records ?? []}
            pagination={{
              current: page,
              pageSize,
              total: data?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            onChange={(pagination, filters, sorter) => {
              // 处理评分筛选（表头列筛选）
              const ratingFilterVal = filters.rating as number[] | null | undefined;
              setRatingFilter(ratingFilterVal && ratingFilterVal.length > 0 ? ratingFilterVal[0] : undefined);
              // 筛选变化时回到第一页
              setPage(1);
              // 处理排序
              if (sorter && !Array.isArray(sorter)) {
                setSortBy(sorter.field as string);
                setSortOrder(sorter.order === 'ascend' ? 'asc' : sorter.order === 'descend' ? 'desc' : undefined);
              }
            }}
            scroll={{ x: 1200 }}
          />
        </Spin>
      </Card>
    </div>
  );
}
