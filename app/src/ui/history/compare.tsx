import * as React from 'react'
import { IGitHubUser } from '../../lib/databases'
import { Commit } from '../../models/commit'
import { ICompareState, CompareType } from '../../lib/app-state'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../../lib/dispatcher'
import { ThrottledScheduler } from '../lib/throttled-scheduler'

interface ICompareSidebarProps {
  readonly repository: Repository
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly state: ICompareState
  readonly branches: ReadonlyArray<Branch>
  readonly emoji: Map<string, string>
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly dispatcher: Dispatcher
  readonly onRevertCommit: (commit: Commit) => void
  readonly onViewCommitOnGitHub: (sha: string) => void
}

interface ICompareSidebarState {
  readonly selectedBranchIndex: number
  readonly compareType: CompareType
}

/** If we're within this many rows from the bottom, load the next history batch. */
const CloseToBottomThreshold = 10

export class CompareSidebar extends React.Component<
  ICompareSidebarProps,
  ICompareSidebarState
> {
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)

  public constructor(props: ICompareSidebarProps) {
    super(props)

    this.state = {
      selectedBranchIndex: -1,
      compareType: CompareType.Default,
    }
  }

  public componentWillMount() {
    this.props.dispatcher.loadCompareState(
      this.props.repository,
      null,
      CompareType.Default
    )
  }

  public render() {
    const isBranchAheadOrBehind =
      this.props.state.ahead > 0 && this.props.state.behind > 0

    return (
      <div id="compare-view">
        {this.renderSelectList()}
        {isBranchAheadOrBehind ? this.renderRadioButtons() : null}
        <CommitList
          gitHubRepository={this.props.repository.gitHubRepository}
          commitLookup={this.props.commitLookup}
          commitSHAs={this.props.state.commitSHAs}
          selectedSHA={this.props.state.selection.sha}
          gitHubUsers={this.props.gitHubUsers}
          localCommitSHAs={this.props.localCommitSHAs}
          emoji={this.props.emoji}
          onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
          onRevertCommit={this.props.onRevertCommit}
          onCommitSelected={this.onCommitSelected}
          onScroll={this.onScroll}
        />
      </div>
    )
  }

  private renderRadioButtons() {
    const compareType = this.state.compareType

    return (
      <div>
        <input
          id="compare-behind"
          type="radio"
          name="ahead-behind"
          value={CompareType.Behind}
          checked={compareType === CompareType.Behind}
          onClick={this.onRadioButtonClicked}
        />
        <label htmlFor="compare-behind">
          {`Behind (${this.props.state.behind})`}
        </label>
        <input
          id="compare-ahead"
          type="radio"
          name="ahead-behind"
          value={CompareType.Ahead}
          checked={compareType === CompareType.Ahead}
          onClick={this.onRadioButtonClicked}
        />
        <label htmlFor="compare-ahead">
          {`Ahead (${this.props.state.ahead})`}
        </label>
      </div>
    )
  }

  private renderSelectList() {
    const options = new Array<JSX.Element>()
    options.push(
      <option value={-1} key={-1}>
        None
      </option>
    )

    let selectedIndex = -1
    for (const [index, branch] of this.props.branches.entries()) {
      if (this.state.selectedBranchIndex === index) {
        selectedIndex = index
      }

      options.push(
        <option value={index} key={branch.name}>
          {branch.name}
        </option>
      )
    }

    return (
      <select value={selectedIndex.toString()} onChange={this.onBranchChanged}>
        {options}
      </select>
    )
  }

  private onRadioButtonClicked = (event: React.FormEvent<HTMLInputElement>) => {
    const compareType = event.currentTarget.value as CompareType
    const selectedBranchIndex = this.state.selectedBranchIndex
    const branch =
      selectedBranchIndex > 0 ? this.props.branches[selectedBranchIndex] : null

    this.props.dispatcher.loadCompareState(
      this.props.repository,
      branch,
      compareType
    )

    this.setState({ compareType })
  }

  private onBranchChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const index = parseInt(event.currentTarget.value, 10)
    const branchName =
      index > 0 ? event.currentTarget.options[index].text : null

    this.setState({ selectedBranchIndex: index })

    if (branchName === null) {
      this.props.dispatcher.loadCompareState(
        this.props.repository,
        null,
        CompareType.Default
      )
    } else {
      const branch = this.props.branches.find(
        branch => branch.name.toLowerCase() === branchName
      )

      if (branch == null) {
        return log.error(`Cannot find branch: ${branchName}`)
      }

      this.props.dispatcher.loadCompareState(
        this.props.repository,
        branch,
        CompareType.Behind
      )
    }
  }

  private onCommitSelected = (commit: Commit) => {
    this.props.dispatcher.changeHistoryCommitSelection(
      this.props.repository,
      commit.sha
    )

    this.loadChangedFilesScheduler.queue(() => {
      this.props.dispatcher.loadChangedFilesForCurrentSelection(
        this.props.repository
      )
    })
  }

  private onScroll = (start: number, end: number) => {
    const commits = this.props.state.commitSHAs

    if (commits.length - end <= CloseToBottomThreshold) {
      this.props.dispatcher.loadNextHistoryBatch(this.props.repository)
    }
  }
}
