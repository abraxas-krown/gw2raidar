// The Framework page (frontend/src/partials/info_framework.html): the site's building blocks on one page, for
// whoever works on its look. The current site showed UIkit's; this shows this frontend's own.
import * as React from 'react';
import { usePercentile } from '../../lib/usePercentile';
import { Badge, Button, ButtonGroup, Card, FieldLabel, Icon, Input, ModeTag, PlayerName, Select, badgeClass } from '../../ui/controls';
import { Dropdown } from '../../ui/Dropdown';
import dropdownStyles from '../../ui/Dropdown.module.css';
import { TagsInput } from '../../ui/TagsInput';
import { useToast } from '../../ui/Toast';
import { useTooltip } from '../../ui/Tooltip';
import styles from './Info.module.css';

const PERCENTILES = [99, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 1];

export function Framework() {
  const pc = usePercentile();
  const tooltip = useTooltip();
  const notify = useToast();
  const [tags, setTags] = React.useState('static,training');

  return (
    <article className={styles.page}>
      <h2>Framework</h2>

      <div className={styles.columns}>
        <div>
          <h1>Heading</h1>
          <h2>Heading</h2>
          <h3>Heading</h3>
          <h4>Heading</h4>
          <h5>Heading</h5>
          <h6>Heading</h6>
        </div>
        <div className="text-mono">
          <h1 className="text-mono">Heading</h1>
          <h2 className="text-mono">Heading</h2>
          <h3 className="text-mono">Heading</h3>
          <h4 className="text-mono">Heading</h4>
          <h5 className="text-mono">Heading</h5>
          <h6 className="text-mono">Heading</h6>
        </div>
      </div>

      <h3>Percentiles</h3>
      <div className={styles.badges}>
        {PERCENTILES.map(p => {
          const badge = pc(p, badgeClass());
          return <span key={p} className={badge.className} style={badge.style}>{p}</span>;
        })}
      </div>

      <h3>Badges and labels</h3>
      <div className={styles.badges}>
        <Badge bold tone="success">Success (4:12.345)</Badge>
        <Badge bold tone="danger">Wipe (6:52.345)</Badge>
        <Badge bold>static</Badge>
        <ModeTag mode="CM" /> <ModeTag mode="LCM" />
      </div>

      <h3>Buttons</h3>
      <div className={styles.badges}>
        <Button>Plain</Button>
        <Button variant="default">Default</Button>
        <Button variant="primary">Primary</Button>
        <Button variant="default" small>Small</Button>
        <Button variant="default" disabled>Disabled</Button>
        <ButtonGroup>
          <Button small variant="primary"><Icon name="check_circle" className="text-success" /> Success</Button>
          <Button small variant="default"><Icon name="cancel" className="text-danger" /> Wipe</Button>
          <Button small variant="default">All</Button>
        </ButtonGroup>
      </div>

      <h3>Cards</h3>
      <div className={styles.columns}>
        <Card><p>Default</p></Card>
        <Card panel><p>Panel</p></Card>
      </div>

      <h3>Forms</h3>
      <form className={styles.form} onSubmit={event => event.preventDefault()}>
        <fieldset>
          <legend className={styles.legend}>Legend</legend>
          <div className={styles.field}><FieldLabel htmlFor="fw-input">Input</FieldLabel><Input id="fw-input" placeholder="Input" /></div>
          <div className={styles.field}>
            <Select defaultValue="1"><option value="1">Option 01</option><option value="2">Option 02</option></Select>
          </div>
          <div className={styles.field}><textarea className={styles.textarea} rows={5} placeholder="Textarea" /></div>
          <div className={styles.field}>
            <label><input type="radio" name="fw-radio" defaultChecked /> A</label>{' '}
            <label><input type="radio" name="fw-radio" /> B</label>
          </div>
          <div className={styles.field}>
            <label><input type="checkbox" defaultChecked /> A</label>{' '}
            <label><input type="checkbox" /> B</label>
          </div>
          <div className={styles.field}><Input placeholder="disabled" defaultValue="disabled" disabled /></div>
          <div className={styles.field}><TagsInput value={tags} onChange={setTags} placeholder="Tags" /></div>
        </fieldset>
      </form>

      <h3>Players</h3>
      <p><PlayerName name="Commander Name" commander as="span" /></p>
      <p><PlayerName name={null} as="span" /></p>

      <h3>Tooltips, dropdowns and notifications</h3>
      <div className={styles.badges}>
        <Button variant="default" {...tooltip(<><h5>Tooltip</h5>With a <strong>title</strong>.</>, { pos: 'bottom-left' })}>Hover</Button>
        <Dropdown toggle={(open, setOpen) => <Button variant="default" onClick={() => setOpen(!open)}>Dropdown <Icon name="expand_more" /></Button>}>
          <ul className={dropdownStyles.nav}>
            <li><button type="button">Item</button></li>
            <li><button type="button">Item</button></li>
          </ul>
        </Dropdown>
        <Button variant="default" onClick={() => notify('Category and tags saved.', 'success')}>Notify</Button>
        <Button variant="default" onClick={() => notify('Error communicating to server', 'danger')}>Error</Button>
      </div>
    </article>
  );
}
