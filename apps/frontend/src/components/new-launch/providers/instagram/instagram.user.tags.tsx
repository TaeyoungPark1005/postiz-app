'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { ReactTags } from 'react-tag-autocomplete';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// 사람 태그(user_tags) 입력. collaborators 와 달리 Instagram 은 한 포스트에
// 최대 20 명까지 태그할 수 있어 별도 컴포넌트로 둔다.
const MAX_USER_TAGS = 20;

export const InstagramUserTags: FC<{
  name: string;
  label: string;
  onChange: (event: {
    target: {
      value: any[];
      name: string;
    };
  }) => void;
}> = (props) => {
  const { onChange, name, label } = props;
  const { getValues } = useSettings();
  const [tagValue, setTagValue] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string>('');
  const t = useT();

  const onDelete = useCallback(
    (tagIndex: number) => {
      const modify = tagValue.filter((_, i) => i !== tagIndex);
      setTagValue(modify);
      onChange({
        target: {
          value: modify,
          name,
        },
      });
    },
    [tagValue, name, onChange]
  );

  const onAddition = useCallback(
    (newTag: any) => {
      if (tagValue.length >= MAX_USER_TAGS) {
        return;
      }
      const modify = [...tagValue, newTag];
      setTagValue(modify);
      onChange({
        target: {
          value: modify,
          name,
        },
      });
    },
    [tagValue, name, onChange]
  );

  useEffect(() => {
    const settings = getValues()[props.name];
    if (settings) {
      setTagValue(settings);
    }
  }, []);

  const suggestionsArray = useMemo(() => {
    return [
      ...tagValue,
      {
        label: suggestions,
        value: suggestions,
      },
    ].filter((f) => f.label);
  }, [suggestions, tagValue]);

  return (
    <div>
      <div>
        <div className={clsx(`text-[14px] mb-[6px]`)}>{label}</div>
        <ReactTags
          placeholderText={t('add_a_username', 'Add a username')}
          suggestions={suggestionsArray}
          selected={tagValue}
          onAdd={onAddition}
          onInput={setSuggestions}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
};
