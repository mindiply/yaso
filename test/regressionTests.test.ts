import {
  selectFrom,
  and,
  equals,
  sqlIn,
  tbl,
  lessThan,
  not,
  exists,
  moreThan,
  value,
  binaryOperator,
  createDBTbl,
  TableDefinition,
  tblCCFields,
  ITbl,
  IId,
  Id,
  alias,
  notIn,
  functionCall,
  prm,
  usePg,
  nullValue,
  max,
  dbDialect
} from '../src';

usePg();

type IWorkspaceUserTable = Omit<
  {
    name: string;
    _id: string;
    email: string;
    emailDigest: string;
    usernameDigest: string;
    workspaceRole: string;
    status: string;
    jobRole: string;
    username: string;
  } & ITbl,
  'imgUrl' | '__typename'
>;

const wpuTableDef: TableDefinition<
  IWorkspaceUserTable & {imgUrl: string | null}
> = {
  name: 'workspaceUser',
  dbName: 'wpu',
  fields: [
    {
      name: '_id',
      dbName: 'wpu_id'
    },
    {
      name: 'name',
      dbName: 'wpu_name',
      isEncrypted: true
    },
    {
      name: 'email',
      dbName: 'wpu_email',
      isEncrypted: true
    },
    {
      name: 'emailDigest',
      dbName: 'wpu_email_digest',
      isHash: true
    },
    {
      name: 'workspaceRole',
      dbName: 'wpu_workspace_role'
    },
    {
      name: 'status',
      dbName: 'wpu_status'
    },
    {
      name: 'jobRole',
      dbName: 'wpu_job_role'
    },
    {
      name: 'username',
      dbName: 'wpu_username',
      isEncrypted: true
    },
    {
      name: 'usernameDigest',
      dbName: 'wpu_username_digest',
      isHash: true
    },
    ...tblCCFields('wpu')
  ],
  calculatedFields: [
    {
      name: 'imgUrl',
      dbName: 'imgUrl',
      calculation: tbl => tbl.cols._id
    }
  ]
};
const wpuTbl = createDBTbl(wpuTableDef);

export interface ProjectRecord extends IId {
  projectId: Id;
  recordType: string;
  recordId: Id;
  parentRecordId: Id | null;
  recordObject: Record<string, unknown>;
  startDate: Date | null;
  endDate: Date | null;
}

const projectRecordDefinition: TableDefinition<ProjectRecord> = {
  name: 'ProjectRecord',
  dbName: 'prr',
  fields: [
    {
      name: '_id',
      dbName: 'prr_id'
    },
    {
      name: 'projectId',
      dbName: 'prr_pjb_id'
    },
    {
      name: 'recordType',
      dbName: 'prr_record_type'
    },
    {
      name: 'recordId',
      dbName: 'prr_record_id'
    },
    {
      name: 'parentRecordId',
      dbName: 'prr_parent_prr_id'
    },
    {
      name: 'recordObject',
      dbName: 'prr_record'
    },
    {
      name: 'startDate',
      dbName: 'prr_start'
    },
    {
      name: 'endDate',
      dbName: 'prr_end'
    }
  ]
};

const prrTbl = createDBTbl(projectRecordDefinition);

interface ProjectRecordMember {
  recordId: Id;
  memberId: Id;
}

const projectRecordMember: TableDefinition<ProjectRecordMember> = {
  name: 'ProjectRecordMember',
  dbName: 'prm',
  fields: [
    {
      name: 'memberId',
      dbName: 'prm_wpu_id'
    },
    {
      name: 'recordId',
      dbName: 'prm_prr_id'
    }
  ]
};

const prmTbl = createDBTbl(projectRecordMember);

export interface ITimelineHistoryTbl extends IId {
  pjbId: Id;
  commitId: string;
  previousCommitId: string | null;
  entryType: string;
  isCheckpoint: boolean;
  entry: Record<string, unknown>;
  when: Date;
  wpuId: Id;
}

const timelineHistoryTblDef: TableDefinition<ITimelineHistoryTbl> = {
  name: 'ProjectTimelineHistory',
  dbName: 'pth',
  fields: [
    {
      name: '_id',
      dbName: 'pth_id'
    },
    {
      name: 'pjbId',
      dbName: 'pth_pjb_id'
    },
    {
      name: 'commitId',
      dbName: 'pth_commit_id'
    },
    {
      name: 'previousCommitId',
      dbName: 'pth_previous_commit_id'
    },
    {
      name: 'entryType',
      dbName: 'pth_entry_type'
    },
    {
      name: 'isCheckpoint',
      dbName: 'pth_is_checkpoint'
    },
    {
      name: 'entry',
      dbName: 'pth_entry'
    },
    {
      name: 'when',
      dbName: 'pth_when'
    },
    {
      name: 'wpuId',
      dbName: 'pth_wpu_id'
    }
  ]
};

const pthTbl = createDBTbl(timelineHistoryTblDef);

export interface TaskReminderSent {
  workspaceUserId: Id;
  when: Date;
}

const trmDef: TableDefinition<TaskReminderSent> = {
  dbName: 'trm',
  name: 'TaskReminderSent',
  fields: [
    {
      name: 'workspaceUserId',
      dbName: 'trm_wpu_id'
    },
    {
      name: 'when',
      dbName: 'trm_when'
    }
  ]
};

const trmTbl = createDBTbl(trmDef);

describe('Mindiply timeline bugs', () => {
  test('Subqueries with binary operators having undefined in where', () => {
    const selectUsersWhoNeedOwnTaskInvitesSql = selectFrom(
      [prrTbl, prmTbl],
      (qry, prr, prmt) => {
        qry
          .fields([prr, prmt.cols.memberId])
          .join(prr.cols._id, prmt.cols.recordId)
          .where(
            and([
              equals(prr.cols.recordType, value('Task')),
              lessThan(prr.cols.endDate, prm('endingBefore')),
              not(
                binaryOperator(
                  prr.cols.recordObject,
                  '@>',
                  value(JSON.stringify({progress: 100}))
                )
              ),
              not(
                exists(
                  tbl(trmTbl).selectQry(trm => ({
                    fields: [value(1)],
                    where: and([
                      equals(trm.cols.workspaceUserId, prmt.cols.memberId),
                      moreThan(trm.cols.when, prm('sentAfter'))
                    ])
                  }))
                )
              ),
              notIn(
                prr.cols.recordId,
                selectFrom(
                  tbl(pthTbl).selectQry(pth => ({
                    fields: [
                      alias(
                        functionCall(
                          'jsonb_array_elements',
                          binaryOperator(pth.cols.entry, '->', value('changes'))
                        ),
                        'value'
                      )
                    ],
                    where: and([
                      moreThan(pth.cols.when, prm('sentAfter')),
                      equals(pth.cols.pjbId, prr.cols.projectId),
                      binaryOperator(
                        pth.cols.entry,
                        '@?',
                        value(
                          '$.changes[*] ? (@.changes.progress >= 0 && @.__typename == "ChangeElementChange" &&  @.element.__typename == "Task")'
                        )
                      )
                    ])
                  })),
                  (qry, innerTbl) => {
                    qry
                      .fields(
                        binaryOperator(
                          binaryOperator(
                            innerTbl.cols.value,
                            '->',
                            value('element')
                          ),
                          '->>',
                          value('_id')
                        )
                      )
                      .where(
                        binaryOperator(
                          innerTbl.cols.value,
                          '@?',
                          value(
                            '$ ? (@.element.__typename == "Task" && @.changes.progress >= 0 && @.__typename == "ChangeElementChange")'
                          )
                        )
                      );
                  }
                )
              ),
              sqlIn(
                prmt.cols.memberId,
                tbl(wpuTbl).selectQry(wpu => ({
                  fields: [wpu.cols._id],
                  where: and([
                    equals(wpu.cols.status, value('active')),
                    equals(wpu.cols.workspaceRole, value('limited'))
                  ])
                }))
              )
            ])
          )
          .orderBy([{field: prmt.cols.memberId}, {field: prr.cols.endDate}]);
      }
    ).toSql();
    expect(selectUsersWhoNeedOwnTaskInvitesSql).toBe(`select
  prr.prr_id as "_id",
  prr.prr_end as "endDate",
  prm.prm_wpu_id as "memberId",
  prr.prr_parent_prr_id as "parentRecordId",
  prr.prr_pjb_id as "projectId",
  prr.prr_record_id as "recordId",
  prr.prr_record as "recordObject",
  prr.prr_record_type as "recordType",
  prr.prr_start as "startDate"
from prr join prm on prr.prr_id = prm.prm_prr_id
where
  prr.prr_record_type = 'Task'
  and prr.prr_end < $[endingBefore]
  and (not (prr.prr_record @> '{"progress":100}'))
  and (
    not (
      exists (
        select 1 as "SQC1"
        from trm
        where
          trm.trm_wpu_id = prm.prm_wpu_id
          and trm.trm_when > $[sentAfter]
      )
    )
  )
  and (
    prr.prr_record_id not in (
      select "SQ"."value" -> 'element' ->> '_id' as "SQC1"
      from
        (
          select jsonb_array_elements(pth.pth_entry -> 'changes') as "value"
          from pth
          where
            pth.pth_when > $[sentAfter]
            and pth.pth_pjb_id = prr.prr_pjb_id
            and pth.pth_entry @?
              '$.changes[*] ? (@.changes.progress >= 0 && @.__typename == "ChangeElementChange" &&  @.element.__typename == "Task")'
        ) as "SQ"
      where
        "SQ"."value" @?
          '$ ? (@.element.__typename == "Task" && @.changes.progress >= 0 && @.__typename == "ChangeElementChange")'
    )
  )
  and (
    prm.prm_wpu_id in (
      select wpu.wpu_id as "_id"
      from wpu
      where
        wpu.wpu_status = 'active'
        and wpu.wpu_workspace_role = 'limited'
    )
  )
order by
  "memberId",
  "endDate"`);
  });

  test('Current_timestamp should not be within parentheses', () => {
    const sql = selectFrom([prrTbl, prmTbl], (qry, prr, prmt) => {
      qry
        .fields([prr, prmt.cols.memberId])
        .join(prr.cols._id, prmt.cols.recordId)
        .where(
          and([
            equals(prr.cols.recordType, value('Task')),
            lessThan(prr.cols.endDate, prm('endingBefore')),
            not(
              binaryOperator(
                prr.cols.recordObject,
                '@>',
                value(JSON.stringify({progress: 100}))
              )
            ),
            not(
              exists(
                tbl(trmTbl).selectQry(trm => ({
                  fields: [value(1)],
                  where: and([
                    equals(trm.cols.workspaceUserId, prmt.cols.memberId),
                    moreThan(trm.cols.when, prm('sentAfter'))
                  ])
                }))
              )
            ),
            notIn(
              prr.cols.recordId,
              selectFrom(
                tbl(pthTbl).selectQry(pth => ({
                  fields: [
                    alias(
                      functionCall(
                        'jsonb_array_elements',
                        binaryOperator(pth.cols.entry, '->', value('changes'))
                      ),
                      'value'
                    )
                  ],
                  where: and([
                    moreThan(
                      pth.cols.when,
                      nullValue(
                        tbl(trmTbl).selectQry(trm => ({
                          fields: [max(trm.cols.when)],
                          where: and([
                            equals(
                              trm.cols.workspaceUserId,
                              prmt.cols.memberId
                            ),
                            moreThan(trm.cols.when, prm('sentAfter'))
                          ])
                        })),
                        dbDialect().now()
                      )
                    ),
                    equals(pth.cols.pjbId, prr.cols.projectId),
                    binaryOperator(
                      pth.cols.entry,
                      '@?',
                      value(
                        '$.changes[*] ? (@.changes.progress >= 0 && @.__typename == "ChangeElementChange" &&  @.element.__typename == "Task")'
                      )
                    )
                  ])
                })),
                (qry, innerQry) => {
                  qry
                    .fields(
                      binaryOperator(
                        binaryOperator(
                          innerQry.cols.value,
                          '->',
                          value('element')
                        ),
                        '->>',
                        value('_id')
                      )
                    )
                    .where(
                      binaryOperator(
                        innerQry.cols.value,
                        '@?',
                        value(
                          '$ ? (@.element.__typename == "Task" && @.changes.progress >= 0 && @.__typename == "ChangeElementChange")'
                        )
                      )
                    );
                }
              )
            ),
            sqlIn(
              prmt.cols.memberId,
              tbl(wpuTbl).selectQry(wpu => ({
                fields: [wpu.cols._id],
                where: and([
                  equals(wpu.cols.status, value('active')),
                  equals(
                    wpu.cols.workspaceRole,
                    value('limited')
                  )
                ])
              }))
            )
          ])
        )
        .orderBy([{field: prmt.cols.memberId}, {field: prr.cols.endDate}]);
    }).toSql();
    expect(sql).toBe(`select
  prr.prr_id as "_id",
  prr.prr_end as "endDate",
  prm.prm_wpu_id as "memberId",
  prr.prr_parent_prr_id as "parentRecordId",
  prr.prr_pjb_id as "projectId",
  prr.prr_record_id as "recordId",
  prr.prr_record as "recordObject",
  prr.prr_record_type as "recordType",
  prr.prr_start as "startDate"
from prr join prm on prr.prr_id = prm.prm_prr_id
where
  prr.prr_record_type = 'Task'
  and prr.prr_end < $[endingBefore]
  and (not (prr.prr_record @> '{"progress":100}'))
  and (
    not (
      exists (
        select 1 as "SQC1"
        from trm
        where
          trm.trm_wpu_id = prm.prm_wpu_id
          and trm.trm_when > $[sentAfter]
      )
    )
  )
  and (
    prr.prr_record_id not in (
      select "SQ"."value" -> 'element' ->> '_id' as "SQC1"
      from
        (
          select jsonb_array_elements(pth.pth_entry -> 'changes') as "value"
          from pth
          where
            (
              pth.pth_when > (
                coalesce(
                  (
                    select max(trm2.trm_when) as "SQC1"
                    from trm as "trm2"
                    where
                      trm2.trm_wpu_id = prm.prm_wpu_id
                      and trm2.trm_when > $[sentAfter]
                  ),
                  current_timestamp
                )
              )
            )
            and pth.pth_pjb_id = prr.prr_pjb_id
            and pth.pth_entry @?
              '$.changes[*] ? (@.changes.progress >= 0 && @.__typename == "ChangeElementChange" &&  @.element.__typename == "Task")'
        ) as "SQ"
      where
        "SQ"."value" @?
          '$ ? (@.element.__typename == "Task" && @.changes.progress >= 0 && @.__typename == "ChangeElementChange")'
    )
  )
  and (
    prm.prm_wpu_id in (
      select wpu.wpu_id as "_id"
      from wpu
      where
        wpu.wpu_status = 'active'
        and wpu.wpu_workspace_role = 'limited'
    )
  )
order by
  "memberId",
  "endDate"`);
  });
});
