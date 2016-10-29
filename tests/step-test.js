const Chai = require('chai');
const Git = require('../git');
const Step = require('../step');


const expect = Chai.expect;


describe('Step', function () {
  describe('push()', function () {
    this.slow(1500);

    it('should push a new step to the top of the stack', function () {
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);

      const message = Step.recentCommit('%s');
      expect(message).to.equal('Step 1.1: target');
    });

    it('should add a new step with an updated sub-index', function () {
      this.tortilla(['step', 'push', '-m', 'dummy', '--allow-empty']);
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);

      const message = Step.recentCommit('%s');
      expect(message).to.equal('Step 1.2: target');
    });

    it('should add a new step with an updated super-index', function () {
      this.tortilla(['step', 'push', '-m', 'dummy', '--allow-empty']);
      this.tortilla(['step', 'tag', '-m', 'dummy']);
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);

      const message = Step.recentCommit('%s');
      expect(message).to.equal('Step 2.1: target');
    });
  });

  describe('pop()', function () {
    this.slow(1500);

    it('should push the last step from the top of the stack', function () {
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);
      this.tortilla(['step', 'push', '-m', 'dummy', '--allow-empty']);
      this.tortilla(['step', 'pop']);

      const message = Step.recentCommit('%s');
      expect(message).to.equal('Step 1.1: target');
    });

    it('should remove tags', function () {
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);
      this.tortilla(['step', 'tag', '-m', 'dummy']);
      this.tortilla(['step', 'pop']);

      const message = Step.recentCommit('%s');
      expect(message).to.equal('Step 1.1: target');

      const tagExists = Git.tagExists('step1');
      expect(tagExists).to.be.falsy;
    });

    it('should remove manual files', function () {
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);
      this.tortilla(['step', 'tag', '-m', 'dummy']);
      this.tortilla(['step', 'pop']);

      const message = Step.recentCommit('%s');
      expect(message).to.equal('Step 1.1: target');

      const fileExists = this.exists(`${this.testDir}/steps/step1.md`);
      expect(fileExists).to.be.falsy;
    });
  });

  describe('tag()', function () {
    this.slow(1500);

    it('should push a new step to the top of the stack', function () {
      this.tortilla(['step', 'tag', '-m', 'target']);

      const message = Step.recentCommit('%s');
      expect(message).to.equal('Step 1: target');
    });

    it('should push a new step with an updated super-index', function () {
      this.tortilla(['step', 'tag', '-m', 'dummy']);
      this.tortilla(['step', 'tag', '-m', 'target']);

      const message = Step.recentCommit('%s');
      expect(message).to.equal('Step 2: target');
    });

    it('should add a new tag', function () {
      this.tortilla(['step', 'tag', '-m', 'target']);

      const message = Step.recentCommit('%s');
      expect(message).to.equal('Step 1: target');

      const tagExists = Git.tagExists('step1');
      expect(tagExists).to.be.truthy;

      const tagHash = Git(['rev-parse', 'step1']);
      const commitHash = Git(['rev-parse', 'HEAD']);
      expect(tagHash).to.equal(commitHash);
    });

    it('should create a manual file', function () {
      this.tortilla(['step', 'tag', '-m', 'target']);

      const message = Step.recentCommit('%s');
      expect(message).to.equal('Step 1: target');

      const fileExists = this.exists(`${this.testDir}/steps/step1.md`);
      expect(fileExists).to.be.truthy;
    });
  });

  describe('reword()', function () {
    this.slow(2000);

    it('should reword the provided step', function () {
      this.tortilla(['step', 'push', '-m', 'dummy', '--allow-empty']);
      this.tortilla(['step', 'push', '-m', 'dummy', '--allow-empty']);
      this.tortilla(['step', 'reword', '1.1', '-m', 'target']);

      const message = Step.recentCommit(1, '%s');
      expect(message).to.equal('Step 1.1: target');
    });

    it('should be able to reword root', function () {
      this.tortilla(['step', 'push', '-m', 'dummy', '--allow-empty']);
      this.tortilla(['step', 'reword', '--root', '-m', 'target']);

      const message = Git([
        'rev-list', '--max-parents=0', 'HEAD', '--format=%s'
      ]).split('\n')[1];

      expect(message).to.equal('target');
    });

    it('should update hash references', function () {
      this.tortilla(['step', 'push', '-m', 'dummy', '--allow-empty']);
      this.tortilla(['step', 'tag', '-m', 'dummy']);
      this.tortilla(['step', 'reword', '1.1', '-m', 'target']);

      const message = Step.recentCommit(1, '%s');
      expect(message).to.equal('Step 1.1: target');

      const rootTagHash = Git(['rev-parse', 'root']);
      const rootCommitHash = Git(['rev-list', '--max-parents=0', 'HEAD']);
      expect(rootTagHash).to.equal(rootCommitHash);

      const stepTagHash = Git(['rev-parse', 'step1']);
      const stepCommitHash = Step.recentCommit('%H');
      expect(stepTagHash).to.equal(stepCommitHash);
    });
  });

  describe('edit()', function () {
    this.slow(3000);

    it('should edit the provided step', function () {
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);

      let size = 10;
      while (size--) {
        this.tortilla(['step', 'push', '-m', 'dummy', '--allow-empty']);
      }

      this.tortilla(['step', 'edit', '1.1']);

      const isRebasing = Git.rebasing();
      expect(isRebasing).to.be.truthy;

      const message = Step.recentCommit('%s');
      expect(message).to.equal('Step 1.1: target');
    });

    it('should be able to edit root', function () {
      this.tortilla(['step', 'push', '-m', 'dummy', '--allow-empty']);
      this.tortilla(['step', 'edit', '--root']);

      const isRebasing = Git.rebasing();
      expect(isRebasing).to.be.truthy;

      const commitHash = Git.recentCommit(['--format=%H']);
      const rootHash = Git(['rev-list', '--max-parents=0', 'HEAD']);
      expect(commitHash).to.equal(rootHash);
    });

    it('should update hash references', function () {
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);
      this.tortilla(['step', 'tag', '-m', 'dummy']);
      this.tortilla(['step', 'edit', '1.1']);

      Git(['rebase', '--continue']);

      const rootTagHash = Git(['rev-parse', 'root']);
      const rootCommitHash = Git(['rev-list', '--max-parents=0', 'HEAD']);
      expect(rootTagHash).to.equal(rootCommitHash);

      const stepTagHash = Git(['rev-parse', 'step1']);
      const stepCommitHash = Step.recentCommit('%H');
      expect(stepTagHash).to.equal(stepCommitHash);
    });

    it('should update step indices when pushing a step', function () {
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);
      this.tortilla(['step', 'push', '-m', 'old', '--allow-empty']);
      this.tortilla(['step', 'edit', '1.1']);
      this.tortilla(['step', 'push', '-m', 'new', '--allow-empty']);

      Git(['rebase', '--continue']);

      const newMessage = Step.recentCommit('%s');
      expect(newMessage).to.equal('Step 1.3: old');

      const oldMessage = Step.recentCommit(1, '%s');
      expect(oldMessage).to.equal('Step 1.2: new');
    });

    it('should update step indices when popping a step', function () {
      this.tortilla(['step', 'push', '-m', 'dummy', '--allow-empty']);
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);
      this.tortilla(['step', 'push', '-m', 'old', '--allow-empty']);
      this.tortilla(['step', 'edit', '1.2']);
      this.tortilla(['step', 'pop']);

      Git(['rebase', '--continue']);

      const oldMessage = Step.recentCommit('%s');
      expect(oldMessage).to.equal('Step 1.2: old');
    });

    it('should update super-step indices when tagging a step', function () {
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);
      this.tortilla(['step', 'tag', '-m', 'old']);
      this.tortilla(['step', 'edit', '1.1']);
      this.tortilla(['step', 'tag', '-m', 'new']);

      Git(['rebase', '--continue']);

      const newMessage = Step.recentCommit('%s');
      expect(newMessage).to.equal('Step 2: old');

      const oldMessage = Step.recentCommit(1, '%s');
      expect(oldMessage).to.equal('Step 1: new');
    });

    it('should update sub-step indices when tagging a step', function () {
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);
      this.tortilla(['step', 'push', '-m', 'old', '--allow-empty']);
      this.tortilla(['step', 'edit', '1.1']);
      this.tortilla(['step', 'tag', '-m', 'new']);

      Git(['rebase', '--continue']);

      const oldMessage = Step.recentCommit('%s');
      expect(oldMessage).to.equal('Step 2.1: old');
    });

    it('should update super-step indices when popping a super-step', function () {
      this.tortilla(['step', 'tag', '-m', 'target']);
      this.tortilla(['step', 'tag', '-m', 'old']);
      this.tortilla(['step', 'edit', '1']);
      this.tortilla(['step', 'pop']);

      Git(['rebase', '--continue']);

      const oldMessage = Step.recentCommit('%s');
      expect(oldMessage).to.equal('Step 1: old');
    });

    it('should update sub-step indices when popping a super-step', function () {
      this.tortilla(['step', 'tag', '-m', 'target']);
      this.tortilla(['step', 'push', '-m', 'old', '--allow-empty']);
      this.tortilla(['step', 'edit', '1']);
      this.tortilla(['step', 'pop']);

      Git(['rebase', '--continue']);

      const oldMessage = Step.recentCommit('%s');
      expect(oldMessage).to.equal('Step 1.1: old');
    });

    it('should resolve addition conflicts when tagging a step', function () {
      this.tortilla(['step', 'push', '-m', 'target', '--allow-empty']);
      this.tortilla(['step', 'tag', '-m', 'old']);
      this.tortilla(['step', 'edit', '1.1']);
      this.tortilla(['step', 'tag', '-m', 'new']);

      Git(['rebase', '--continue']);

      const oldMessage = Step.recentCommit('%s');
      expect(oldMessage).to.equal('Step 2: old');

      const newMessage = Step.recentCommit(1, '%s');
      expect(newMessage).to.equal('Step 1: new');

      const oldFileExists = this.exists(`${this.testDir}/steps/step1.md`);
      expect(oldFileExists).to.be.truthy;

      const newFileExists = this.exists(`${this.testDir}/steps/step2.md`);
      expect(newFileExists).to.be.truthy;
    });

    it('should resolve removal conflicts when tagging a step', function () {
      this.tortilla(['step', 'tag', '-m', 'target']);
      this.tortilla(['step', 'tag', '-m', 'old']);
      this.tortilla(['step', 'edit', '1']);
      this.tortilla(['step', 'pop']);

      Git(['rebase', '--continue']);

      const oldMessage = Step.recentCommit('%s');
      expect(oldMessage).to.equal('Step 1: old');

      const oldFileExists = this.exists(`${this.testDir}/steps/step1.md`);
      expect(oldFileExists).to.be.truthy;
    });
  });
});